-- Befund 2 (Mystery-Shopper 18.11.2026): Test-/Demo-Konten auf Production entfernen.
-- NICHT automatisch ausführen. Supabase „CampsPilot Production“ → SQL-Editor, nur mit Serkans Go.
-- Rückweg: Vor Schritt 2 ein Backup ziehen (DEPLOYMENT.md → Backup). Gelöschte Konten lassen sich
-- nur aus dem Backup oder durch Neuanlage (scripts/create_platform_user.py) wiederherstellen.
-- Die Datei enthält bewusst keine Mailadressen: Die Liste entsteht in Schritt 1 und wird geprüft.
-- Schritte EINZELN markieren und ausführen: Der Probelauf endet absichtlich mit einer Fehlermeldung,
-- die sonst das Ergebnis von Schritt 1 verdeckt.
-- Gelöscht werden nur Konten. Demo-Vereine und ihre Testanmeldungen bleiben stehen.

-- ---------------------------------------------------------------------------------------------
-- SCHRITT 1 (nur lesen): Kandidaten mit allem, was gegen das Löschen spricht.
-- ---------------------------------------------------------------------------------------------
select u.id,
       u.email,
       u.created_at::date                                              as angelegt,
       u.last_sign_in_at::date                                         as letzter_login,
       exists (select 1 from public.platform_owners p where p.user_id = u.id) as ist_plattform_owner,
       coalesce((select string_agg(o.slug, ', ' order by o.slug)
                 from public.organization_members m
                 join public.organizations o on o.id = m.organization_id
                 where m.user_id = u.id), '')                          as vereine
from auth.users u
where u.email ilike '%@campspilot.dev'
   or u.email ilike '%@campspilot.example'
   or u.email ilike '%@example.%'
   or u.email ilike 'cross-org-test%'
   or u.email ilike 'demo@%'
   or u.email ilike '%.demo@%'
   or u.email ilike '%+test%'
order by u.email;
-- Prüfen, bevor es weitergeht:
--   * Erwartet laut Befund: 11 Zeilen. Andere Zahl → stoppen und klären.
--   * ist_plattform_owner = true → nicht löschen.
--   * Die Muster treffen auch echte Adressen wie demo@<verein>.de oder name+test@… → jede Zeile ansehen.
--   * vereine enthält ksv-baunatal oder jk-performance-academy → erst klären, ob ein echter Mensch
--     dieses Konto nutzt (offen: Zugang eines Trainers, siehe PROD-2026-11-18-konto-vereinszuordnung.sql).

-- ---------------------------------------------------------------------------------------------
-- SCHRITT 2 (ändert Daten): nur die geprüften IDs löschen.
-- Die IDs aus Schritt 1 unten eintragen. Mit bestaetigt := false läuft alles als Probelauf und
-- wird vollständig zurückgerollt; erst mit true wird gelöscht.
-- ---------------------------------------------------------------------------------------------
do $$
declare
    bestaetigt  constant boolean := false;                 -- erst nach geprüftem Probelauf auf true setzen
    erwartet    constant integer := 11;                    -- Anzahl geprüfter Konten aus Schritt 1
    ids         constant uuid[]  := array[
        -- '00000000-0000-0000-0000-000000000000',
    ]::uuid[];
    freigegebene_vereine constant text[] := array[]::text[];  -- z. B. array['demo-verein']: Vereine mit reinen Testanmeldungen
    geschuetzt  integer;
    geloescht   integer;
begin
    if coalesce(array_length(ids, 1), 0) <> erwartet then
        raise exception 'Abbruch: % IDs eingetragen, erwartet %.', coalesce(array_length(ids, 1), 0), erwartet;
    end if;

    -- Geschützt sind: Plattform-Owner, Konten an KSV/JK und Konten an jedem Verein, der schon
    -- Anmeldungen hat. Für einen Demo-Verein mit Testanmeldungen den Slug bewusst in
    -- freigegebene_vereine eintragen.
    select count(*) into geschuetzt
    from auth.users u
    where u.id = any (ids)
      and (exists (select 1 from public.platform_owners p where p.user_id = u.id)
           or exists (select 1 from public.organization_members m
                      join public.organizations o on o.id = m.organization_id
                      where m.user_id = u.id
                        and (o.slug in ('ksv-baunatal', 'jk-performance-academy')
                             or (o.slug <> all (freigegebene_vereine)
                                 and exists (select 1 from public.camp_registrations r where r.organization_id = o.id)))));
    if geschuetzt > 0 then
        raise exception 'Abbruch: % Konto/Konten sind Plattform-Owner, hängen an KSV/JK oder an einem Verein mit Anmeldungen. Erst klären.', geschuetzt;
    end if;

    -- organization_members und platform_owners hängen per ON DELETE CASCADE an auth.users;
    -- audit_log behält die Einträge (actor_user_id wird NULL, actor_email bleibt).
    delete from auth.users where id = any (ids);
    get diagnostics geloescht = row_count;
    if geloescht <> erwartet then
        raise exception 'Abbruch: % gelöscht, erwartet %. Nichts geändert.', geloescht, erwartet;
    end if;

    if not bestaetigt then
        raise exception 'PROBELAUF ok: % Konten würden gelöscht. Nichts geändert. Zum Ausführen bestaetigt := true setzen.', geloescht;
    end if;
    raise notice 'Erledigt: % Test-/Demo-Konten gelöscht.', geloescht;
end $$;

-- SCHRITT 3 (nur lesen): Kontrolle. Erwartet 0 Zeilen (bis auf bewusst behaltene Konten).
-- → Abfrage aus Schritt 1 erneut ausführen.
