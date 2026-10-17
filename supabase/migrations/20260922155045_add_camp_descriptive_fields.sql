-- Eltern-Flow-Auftrag §6.2 (camp-Screen): Faktentabelle (Ort, Betreuung,
-- Verpflegung) und Leistungsliste ("im Preis enthalten") brauchen Felder,
-- die camps bisher nicht hat. Alle vier optional/nullable -- es gibt für
-- KSV/JK aktuell keine belastbare Quelle für diese konkreten Werte (siehe
-- backend_saas/seeds/ksv-baunatal.sql: "not invented data"-Prinzip gilt
-- genauso hier). Der camp-Screen zeigt jeden Abschnitt nur, wenn die
-- zugehörigen Felder tatsächlich gesetzt sind -- kein Platzhaltertext.

alter table public.camps
    add column if not exists location text,
    add column if not exists care_info text,
    add column if not exists meals_info text,
    add column if not exists includes text[];

comment on column public.camps.location is 'Freitext, z. B. "Sportpark Baunatal, Platz 2". NULL = Abschnitt "Ort" wird nicht angezeigt.';
comment on column public.camps.care_info is 'Freitext Betreuungszeiten, z. B. "Ab 8 Uhr, bis 17 Uhr". NULL = kein Eintrag in der Faktentabelle.';
comment on column public.camps.meals_info is 'Freitext Verpflegung, z. B. "Mittagessen und Getränke". NULL = kein Eintrag in der Faktentabelle.';
comment on column public.camps.includes is 'Kurze Stichpunkte für die Leistungsliste "Im Preis enthalten" (§6.2), in Anzeigereihenfolge. NULL/leer = Abschnitt wird nicht angezeigt.';
