feat/s4-freigabe-konsole
STATUS: fertig zur Prüfung

COMMIT: 5c0ee9273e23bc6173764383a18080397dc3b4a2

TESTS:
  npx vitest run --root frontend app/platform/\(console\)/\[org\]/ReviewBox.test.tsx
  Test Files  1 passed (1)
       Tests  6 passed (6)
  Duration  1.31s

  Gesamtsuite (53 Dateien):
  Test Files  3 failed | 50 passed (53)
       Tests  4 failed | 471 passed (475)
  → 4 vorbestehende Fehler (tokens.css/focus.css ENOENT, adminConsistency glob)
    unverändert seit HEAD~1 — nicht durch S4 verursacht.

MUTATIONSPROBE:
  Test: "reject without reason shows error and does not call action"
  Wenn die Längenprüfung (note.trim().length < 10) aus ReviewBox.tsx entfernt wird
  (Zeile ~42: das if-Block vor dem reviewOrganizationAction-Aufruf), wird
  reviewOrganizationAction aufgerufen — expect(reviewOrganizationAction).not.toHaveBeenCalled()
  schlägt fehl → Test rot.

ÄNDERUNGEN:

F1 — saasAdminApi.ts (frontend/app/lib/saasAdminApi.ts):
  + 5 Felder in OrganizationAdmin: review_status, submitted_at, avv_version,
    review_note, approved_at
  + listOrganizationsByReviewStatus(status, token) → GET /admin/organizations?review_status=…
  + reviewOrganization(slug, decision, token, note?) → POST /admin/organizations/{slug}/review
    Wirft AdminActionError mit deutschen Meldungen bei 409 und anderen Fehlern.

F2 — SubmittedOrgsSection.tsx (neu, frontend/app/platform/(console)/)
  Server-Komponente. Props: orgs: OrganizationAdmin[].
  Gibt null zurück wenn orgs.length === 0 (Abschnitt nicht sichtbar).
  Zeigt je Verein: Name, Slug, Ansprechpartner, Kontakt-E-Mail,
  Eingereicht-Datum (deutsches Format), AVV-Version, Link „Prüfen".

F3 — /platform page.tsx (geändert)
  Filtert organizations nach review_status === 'submitted'.
  Rendert <SubmittedOrgsSection orgs={submitted} /> vor der Vereinsliste.

F4 — reviewActions.ts (neu, frontend/app/platform/(console)/[org]/)
  Server Action reviewOrganizationAction(orgSlug, _previous, formData).
  Validiert: note.trim().length >= 10 bei decision='reject' (serverseitig).
  Ruft reviewOrganization() auf, dann revalidatePath(/platform/{orgSlug}).

F5 — ReviewBox.tsx (neu, frontend/app/platform/(console)/[org]/)
  Client-Komponente. Props: org: OrganizationAdmin, campCount: number.
  Rendert je nach review_status:
    draft     → "Noch nicht eingereicht"
    rejected  → Ablehnungsgrund
    approved  → "Freigegeben am …" (deutsches Datum)
    submitted → Checkliste + Vorschau-Link + Freigeben/Ablehnen
  Checkliste (✓/✗ aus Org-Daten):
    - Vereinsname plausibel (!!org.name)
    - Impressum / Anschrift vorhanden (!!legal_name && !!legal_address)
    - Mindestens ein Camp (campCount > 0)
    - Bankverbindung vorhanden (!!iban)
  Ablehnen öffnet Feld „Ablehnungsgrund" (min. 10 Zeichen, Pflicht).
  Client-seitige Validierung verhindert Action-Aufruf bei leerem Grund.
  Fokus nach Fehler auf statusRef (requestAnimationFrame).
  Buttons ≥ 44 px (cp-btn-* Klassen aus Button.tsx).

F6 — /platform/[org]/page.tsx (geändert)
  Import ReviewBox; rendert <ReviewBox org={org} campCount={camps.length} />
  zwischen PublishToggle und dem Einrichtungs-Abschnitt.
  Sicherheitsgrenze: (console)-Layout prüft bereits me.is_platform_owner,
  nicht-Betreiber landen auf ihrer eigenen Vereinsverwaltung.

F7 — ReviewBox.test.tsx (neu, frontend/app/platform/(console)/[org]/)
  @vitest-environment jsdom, 6 Tests:
  1. Abschnitt sichtbar bei n > 0 (renderToStaticMarkup von SubmittedOrgsSection)
  2. Abschnitt fehlt bei n = 0
  3. Freigeben: reviewOrganizationAction mit decision='approve' aufgerufen
  4. Ablehnen ohne Grund: Fehlermeldung, kein Action-Aufruf (Mutationsprobe)
  5. Ablehnen mit Grund: Action mit note aufgerufen
  6. API-Fehler: Meldung [role=alert] sichtbar, Freigeben-Button nicht disabled

SCREENSHOT-HINWEISE:
  /platform (Übersicht): Abschnitt „Wartet auf Freigabe (n)" erscheint nur,
    wenn Vereine mit review_status='submitted' vorhanden sind (orangefarbener
    Hintergrund, Link „Prüfen" je Verein).
  /platform/[org] (Detail): neuer Kasten „Freigabe" oberhalb von „Einrichtung".
    submitted  → Checkliste + Vorschau-Link + Freigeben/Ablehnen-Buttons
    approved   → grüner Kasten mit Datum
    rejected   → roter Kasten mit Grund
    draft      → neutraler Hinweis

NICHT_AUSGEFÜHRT:
  - Kein Deploy, kein Push nach origin/main
  - Kein manueller Browser-Test (kein laufender Dev-Server)
  - Keine echten Supabase-/Render-Calls in Tests (alles gemockt)
  - npm run build wurde nicht ausgeführt (kein --prefix-Befehl erlaubt)
  - Die 4 vorbestehenden Test-Fehler (ENOENT tokens.css, focus.css,
    adminConsistency glob) wurden nicht behoben — kein Scope dieser Aufgabe
