"""Local CSV rehearsal. Never imports application settings or sends notifications."""
import argparse
import csv
from datetime import date, datetime
import json
import os
from pathlib import Path
import re
import unicodedata
from uuid import UUID, NAMESPACE_URL, uuid5

import psycopg2
from psycopg2.extensions import parse_dsn
from psycopg2.extras import RealDictCursor


FORBIDDEN = ('sommercamps-0aod', 'wkmckfbzhmihyfwiekct',
             'asowsktznpiioaxerlta', 'campspilot.vercel.app')
DIRECT = ('child_first_name', 'child_last_name', 'jersey_size', 'allergies',
          'status', 'payment_status', 'photo_permission', 'registration_token',
          'stripe_session_id', 'paid_at', 'email_sent_at', 'created_at')
EXTRA = ('parent_first_name', 'parent_last_name', 'camp_slug', 'terms_accepted')
SOURCE = ('id', 'birth_date', 'parent_name', 'email', 'phone', 'selected_camp_week',
          'notes', 'consent_privacy') + DIRECT


class RowError(ValueError):
    """Only static, non-personal messages may be used here."""


class InputError(ValueError):
    """Safe configuration/file diagnostics, without connection or CSV values."""


def child_key(data):
    def name(value):
        return unicodedata.normalize('NFC', value.strip()).casefold()
    return (str(data['camp_id']), name(data['child_first_name']),
            name(data['child_last_name']), data['child_birth_date'])


def target(url, apply=False, confirm=None):
    """Validate before connecting; this task permits only a loopback rehearsal."""
    if not url or any(word in url.lower() for word in FORBIDDEN):
        raise InputError('DATABASE_URL fehlt oder Ziel ist gesperrt')
    try:
        config = parse_dsn(url)
    except psycopg2.Error:
        raise InputError('DATABASE_URL ungültig') from None
    host = config.get('host', '')
    decoded = ' '.join(config.values())
    if apply and re.search(r'prod|stag|(?:^|[^a-z])stg(?:$|[^a-z])', decoded, re.I) and confirm != host:
        raise InputError('Prod/Staging benötigt --target-confirm mit exaktem Host')
    if (host != '127.0.0.1' or config.get('port') != '55443'
            or config.get('dbname') != 'dev_l5' or config.get('service')
            or config.get('hostaddr', host) != host):
        raise InputError('Nur 127.0.0.1:55443/dev_l5 ist für L5 freigegeben')
    # Explicit values override PGHOSTADDR/PGCONNECT_TIMEOUT and service-file defaults.
    config['hostaddr'] = '127.0.0.1'
    config['connect_timeout'] = '5'
    return config


def boolean(value, field):
    if value not in ('true', 'false'):
        raise RowError(field + ': true/false erforderlich')
    return value == 'true'


def mapped(row, org, camp):
    if any(not row.get(key) for key in ('id', 'birth_date', 'email', 'phone',
           'child_first_name', 'child_last_name') + EXTRA):
        raise RowError('Pflichtfeld fehlt')
    if row.get('notes'):
        raise RowError('notes: verlustfreie Zielablage ungeklärt')
    if ' '.join(row['parent_name'].split()) != ' '.join(
            (row['parent_first_name'] + ' ' + row['parent_last_name']).split()):
        raise RowError('parent_name: stimmt nicht mit expliziten Namensfeldern überein')
    try:
        source_id = UUID(row['id'])
    except ValueError:
        raise RowError('id: UUID erforderlich') from None
    try:
        birth_date = date.fromisoformat(row['birth_date'])
        if birth_date.isoformat() != row['birth_date']:
            raise ValueError
    except ValueError:
        raise RowError('birth_date: gültiges Datum YYYY-MM-DD erforderlich') from None
    result = {key: row.get(key) or None for key in DIRECT}
    result.update(organization_id=org, camp_id=camp,
                  id=str(uuid5(NAMESPACE_URL, f'ksv-import:{org}:{source_id}')),
                  parent_first_name=row['parent_first_name'],
                  parent_last_name=row['parent_last_name'],
                  parent_email=row['email'], parent_phone=row['phone'],
                  child_birth_date=birth_date,
                  terms_accepted=boolean(row['terms_accepted'], 'terms_accepted'),
                  privacy_accepted=boolean(row.get('consent_privacy'), 'consent_privacy'),
                  photo_permission=boolean(row.get('photo_permission'), 'photo_permission'))
    if not result['terms_accepted'] or not result['privacy_accepted']:
        raise RowError('Einwilligung fehlt')
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', row['email']):
        raise RowError('email: Format ungültig')
    today = date.today()
    oldest = today.replace(year=today.year - 100)
    if not oldest <= result['child_birth_date'] <= today:
        raise RowError('birth_date: Datum unplausibel')
    if result['status'] not in ('registered', 'confirmed', 'cancelled', 'waitlist'):
        raise RowError('status: ungültig')
    if result['payment_status'] not in ('open', 'paid', 'refunded', 'waived', 'cancelled'):
        raise RowError('payment_status: ungültig')
    try:
        result['registration_token'] = str(UUID(row['registration_token']))
    except ValueError:
        raise RowError('registration_token: UUID erforderlich') from None
    for field in ('paid_at', 'email_sent_at', 'created_at'):
        if result[field]:
            try:
                parsed = datetime.fromisoformat(result[field].replace('Z', '+00:00'))
            except ValueError:
                raise RowError(field + ': Zeitstempel ungültig') from None
            if parsed.tzinfo is None:
                raise RowError(field + ': Zeitzone fehlt')
            result[field] = parsed
    if not result['created_at']:
        raise RowError('created_at fehlt')
    return result


def run(path, slug, url, apply=False, confirm=None):
    config = target(url, apply, confirm)
    report = dict(rows=0, valid=0, duplicates=0, existing=0, written=0, errors=[])
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, strict=True)
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)) or set(headers) != set(SOURCE + EXTRA):
            raise InputError('CSV-Spalten stimmen nicht mit dem dokumentierten Vertrag überein')
        rows = [(reader.line_num, row) for row in reader]
    connection = psycopg2.connect(**config)
    try:
        connection.set_session(readonly=not apply)
        with connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SET LOCAL statement_timeout = '10s'")
                # Serialize rehearsals, including duplicate checks, without schema changes.
                cur.execute('SELECT pg_advisory_xact_lock(510005)')
                cur.execute('SELECT id FROM public.organizations WHERE slug=%s', (slug,))
                orgrow = cur.fetchone()
                if not orgrow:
                    raise InputError('Organisation fehlt')
                org = str(orgrow['id'])
                cur.execute('SELECT id, slug FROM public.camps WHERE organization_id=%s', (org,))
                camps = {r['slug']: str(r['id']) for r in cur.fetchall()}
                cur.execute('''SELECT camp_id,child_first_name,child_last_name,child_birth_date
                    FROM public.camp_registrations WHERE organization_id=%s''', (org,))
                existing_children = {child_key(r) for r in cur.fetchall()}
                pending, seen, children, tokens, sessions = [], set(), set(), set(), set()
                for number, raw in rows:
                    report['rows'] += 1
                    try:
                        if None in raw or any(v is None for v in raw.values()):
                            raise RowError('CSV-Zeilenlänge ungültig')
                        row = {k: v.strip() for k, v in raw.items()}
                        if any('\x00' in value for value in row.values()):
                            raise RowError('CSV enthält ungültiges Nullzeichen')
                        if row['camp_slug'] not in camps:
                            raise RowError('camp_slug: Camp fehlt in Zielorganisation')
                        data = mapped(row, org, camps[row['camp_slug']])
                        identity = data['id']
                        child = child_key(data)
                        if identity in seen or child in children:
                            report['duplicates'] += 1
                            raise RowError('Doppelte Quell-ID oder Kind/Camp')
                        if data['registration_token'] in tokens or (
                                data['stripe_session_id'] and data['stripe_session_id'] in sessions):
                            report['duplicates'] += 1
                            raise RowError('Doppeltes Token oder Stripe-ID in CSV')
                        seen.add(identity)
                        children.add(child)
                        tokens.add(data['registration_token'])
                        if data['stripe_session_id']:
                            sessions.add(data['stripe_session_id'])
                        cur.execute('SELECT * FROM public.camp_registrations WHERE id=%s', (identity,))
                        previous = cur.fetchone()
                        if previous:
                            uuid_columns = ('id', 'organization_id', 'camp_id', 'registration_token')
                            if any((str(previous[k]) if k in uuid_columns else previous[k]) != v
                                   for k, v in data.items()):
                                raise RowError('Vorhandene Importidentität hat abweichende Daten')
                            report['existing'] += 1
                        else:
                            cur.execute('''SELECT 1 FROM public.camp_registrations
                                WHERE registration_token=%s OR
                                (stripe_session_id IS NOT NULL AND stripe_session_id=%s)''',
                                (data['registration_token'], data['stripe_session_id']))
                            if cur.fetchone():
                                report['duplicates'] += 1
                                raise RowError('Token oder Stripe-ID bereits belegt')
                            if child in existing_children:
                                report['duplicates'] += 1
                                raise RowError('Kind/Camp bereits vorhanden')
                            pending.append(data)
                        report['valid'] += 1
                    except RowError as exc:
                        report['errors'].append(dict(line=number, error=str(exc)))
                    except (ValueError, TypeError, KeyError):
                        # Never include CSV values (including dates/names) in output.
                        report['errors'].append(dict(line=number, error='Validierung oder Konflikt; CSV-Vertrag prüfen'))
                if apply and not report['errors']:
                    for data in pending:
                        columns = tuple(data)
                        # Column names are constants from mapped(), never CSV headers.
                        cur.execute('INSERT INTO public.camp_registrations (' + ','.join(columns)
                                    + ') VALUES (' + ','.join(['%s'] * len(columns)) + ')',
                                    tuple(data.values()))
                    report['written'] = len(pending)
                if not apply:
                    connection.rollback()
    finally:
        connection.close()
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', required=True)
    parser.add_argument('--org-slug', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--target-confirm')
    args = parser.parse_args(argv)
    try:
        result = run(args.csv, args.org_slug, os.environ.get('DATABASE_URL'),
                     args.apply, args.target_confirm)
    except InputError as exc:
        print(json.dumps({'error': str(exc)}))
        return 2
    except (ValueError, OSError, UnicodeError, csv.Error, psycopg2.Error):
        print(json.dumps({'error': 'Import abgelehnt; Ziel, CSV und Konflikte prüfen'}))
        return 2
    print(json.dumps(result))
    return 2 if result['errors'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
