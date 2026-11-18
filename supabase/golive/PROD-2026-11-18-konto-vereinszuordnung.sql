-- Befund 3 (Mystery-Shopper 18.11.2026): Ein Trainer-Konto hängt an keinem Verein.
-- NICHT automatisch ausführen. Supabase „CampsPilot Production“ → SQL-Editor, nur mit Serkans Go.
-- Vorher mit dem Betroffenen klären, welcher Verein richtig ist und ob ein zweites Konto
-- (z. B. ein Demo-Konto am selben Verein) sein eigentlicher Zugang ist.
-- Die Datei enthält bewusst keine Mailadresse: unten an den zwei markierten Stellen eintragen.
-- Schritte EINZELN markieren und ausführen (der Probelauf endet absichtlich mit einer Fehlermeldung).
-- Rückweg: steht am Ende (eine DELETE-Zeile, entfernt nur diese eine Zuordnung).

-- ---------------------------------------------------------------------------------------------
-- SCHRITT 1 (nur lesen): Konto und heutige Zuordnungen.
-- ---------------------------------------------------------------------------------------------
select u.id, u.email, u.last_sign_in_at::date as letzter_login,
       exists (select 1 from public.platform_owners p where p.user_id = u.id) as ist_plattform_owner,
       coalesce((select string_agg(o.slug, ', ' order by o.slug)
                 from public.organization_members m
                 join public.organizations o on o.id = m.organization_id
                 where m.user_id = u.id), '(keine)')                         as vereine
from auth.users u
where lower(u.email) = lower('<E-MAIL HIER EINTRAGEN>');
-- Erwartet: genau 1 Zeile, vereine = (keine).

-- Wer verwaltet den Zielverein heute? (zeigt auch ein mögliches Demo-Konto)
select o.slug, u.email, u.last_sign_in_at::date as letzter_login
from public.organization_members m
join public.organizations o on o.id = m.organization_id
join auth.users u on u.id = m.user_id
where o.slug = 'ksv-baunatal'
order by u.email;

-- ---------------------------------------------------------------------------------------------
-- SCHRITT 2 (ändert Daten): Konto dem Verein als org_admin zuordnen.
-- Mit bestaetigt := false Probelauf (wird zurückgerollt).
-- ---------------------------------------------------------------------------------------------
do $$
declare
    bestaetigt constant boolean := false;                      -- erst nach geprüftem Probelauf auf true
    mail       constant text    := '<E-MAIL HIER EINTRAGEN>';
    ziel_slug  constant text    := 'ksv-baunatal';             -- nach Klärung ggf. anpassen
    nutzer     uuid;
    verein     uuid;
    treffer    integer;
    neu        integer;
begin
    select count(*), (array_agg(id))[1] into treffer, nutzer from auth.users where lower(email) = lower(mail);
    if treffer <> 1 then
        raise exception 'Abbruch: % Konten mit dieser Adresse gefunden, erwartet 1.', treffer;
    end if;
    select id into verein from public.organizations where slug = ziel_slug;
    if verein is null then
        raise exception 'Abbruch: Verein % nicht gefunden.', ziel_slug;
    end if;

    insert into public.organization_members (organization_id, user_id, role)
    values (verein, nutzer, 'org_admin')
    on conflict (organization_id, user_id) do nothing;
    get diagnostics neu = row_count;

    if neu > 0 then
        insert into public.audit_log (actor_email, action, organization_id, target_type, target_id, metadata)
        values ('sql-editor', 'organization.member_assigned', verein, 'user', nutzer::text,
                jsonb_build_object('source', 'PROD-2026-11-18-konto-vereinszuordnung.sql'));
    end if;

    if not bestaetigt then
        raise exception 'PROBELAUF ok: % Zuordnung(en) würden angelegt. Nichts geändert. Zum Ausführen bestaetigt := true setzen.', neu;
    end if;
    raise notice 'Erledigt: % Zuordnung(en) angelegt (0 = bestand schon).', neu;
end $$;

-- SCHRITT 3 (nur lesen): Abfrage aus Schritt 1 erneut ausführen. Erwartet: vereine = ksv-baunatal.
-- Danach den Betroffenen bitten, sich einmal anzumelden.

-- RÜCKWEG (nur bei Bedarf, entfernt genau diese Zuordnung):
-- delete from public.organization_members m
-- using auth.users u, public.organizations o
-- where m.user_id = u.id and m.organization_id = o.id
--   and lower(u.email) = lower('<E-MAIL HIER EINTRAGEN>') and o.slug = 'ksv-baunatal';
