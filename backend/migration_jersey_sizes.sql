-- Migration: Joma-Trikotgrößen
-- Bestehende Constraint droppen, alte Werte auf NULL setzen,
-- dann mit neuen Werten neu anlegen.
-- Im Supabase SQL Editor ausführen.

ALTER TABLE camp_registrations
    DROP CONSTRAINT IF EXISTS chk_jersey_size_allowed;

-- Alte Größenwerte (die nicht mehr gültig sind) auf NULL setzen
UPDATE camp_registrations
SET jersey_size = NULL
WHERE jersey_size NOT IN (
    '6XS–5XS (104–116)',
    '4XS–3XS (128–140)',
    '2XS (152)',
    'XS (164)',
    'S',
    'M'
);

ALTER TABLE camp_registrations
    ADD CONSTRAINT chk_jersey_size_allowed
        CHECK (jersey_size IS NULL OR jersey_size IN (
            '6XS–5XS (104–116)',
            '4XS–3XS (128–140)',
            '2XS (152)',
            'XS (164)',
            'S',
            'M'
        ));
