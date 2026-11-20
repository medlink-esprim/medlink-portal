-- =============================================================
-- MedLink — Sprint 5 (Release 3) : absences, droits INPDP, audit et alertes de sécurité,
-- maintenance annoncée, supervision et statistiques anonymisées, synthèse de la Direction.
--
-- Nouvelle base : exécuté automatiquement après 001 à 006.
-- Base existante :
--   docker compose exec -T db psql -U medlink -d medlink -v ON_ERROR_STOP=1 < db/migrations/007_sprint5.sql
-- =============================================================

-- US-16 / US-36 : nouveaux types de notification (hors transaction : ALTER TYPE ... ADD VALUE)
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'demande';
ALTER TYPE type_notification ADD VALUE IF NOT EXISTS 'securite';

-- US-21 : absences d'un praticien (congé, formation...). Les créneaux libres de la période
-- sont bloqués ; ceux créés plus tard dans la période naissent bloqués.
CREATE TABLE absences (
  id_absence    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_praticien  UUID         NOT NULL REFERENCES praticiens ON DELETE CASCADE,
  debut         TIMESTAMPTZ  NOT NULL,
  fin           TIMESTAMPTZ  NOT NULL,
  motif         VARCHAR(120),
  date_creation TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (fin > debut)
);
CREATE INDEX idx_absences_praticien ON absences (id_praticien, debut);

-- US-16 : demandes d'export ou de suppression des données personnelles (loi INPDP),
-- suivies jusqu'à leur traitement par l'administration.
CREATE TABLE demandes_donnees (
  id_demande      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_patient      UUID         NOT NULL REFERENCES patients ON DELETE CASCADE,
  type            VARCHAR(12)  NOT NULL CHECK (type IN ('export', 'suppression')),
  statut          VARCHAR(10)  NOT NULL DEFAULT 'recue' CHECK (statut IN ('recue', 'en_cours', 'traitee', 'refusee')),
  message         VARCHAR(500),
  reponse         VARCHAR(500),
  export_chiffre  BYTEA,                         -- export JSON chiffré (AES-256-GCM), type « export »
  id_traitant     UUID         REFERENCES utilisateurs ON DELETE SET NULL,
  date_demande    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  date_traitement TIMESTAMPTZ
);
CREATE INDEX idx_demandes_statut ON demandes_donnees (statut, date_demande);
-- une seule demande ouverte par type et par patient
CREATE UNIQUE INDEX uq_demande_ouverte ON demandes_donnees (id_patient, type) WHERE statut IN ('recue', 'en_cours');

-- US-36 : alertes sur accès suspect (une alerte par utilisateur, règle et heure)
CREATE TABLE alertes_securite (
  id_alerte       BIGSERIAL    PRIMARY KEY,
  date_alerte     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fenetre_debut   TIMESTAMPTZ  NOT NULL,
  id_utilisateur  UUID         NOT NULL,           -- pas de clé étrangère : l'alerte survit au compte
  regle           VARCHAR(40)  NOT NULL,
  nb_dossiers     INTEGER      NOT NULL,
  details         JSONB        NOT NULL,
  statut          VARCHAR(10)  NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'traitee')),
  id_traitant     UUID,
  date_traitement TIMESTAMPTZ,
  UNIQUE (id_utilisateur, regle, fenetre_debut)
);

-- US-38 : annonces de maintenance (publiées au moins 48 h à l'avance)
CREATE TABLE annonces_maintenance (
  id_annonce    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  debut         TIMESTAMPTZ  NOT NULL,
  fin           TIMESTAMPTZ  NOT NULL,
  message       VARCHAR(300) NOT NULL,
  annulee       BOOLEAN      NOT NULL DEFAULT false,
  id_auteur     UUID         REFERENCES utilisateurs ON DELETE SET NULL,
  date_creation TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (fin > debut)
);

-- Statistiques (US-31, US-32, US-50, US-51) : index de lecture par date de créneau
CREATE INDEX IF NOT EXISTS idx_creneaux_debut ON creneaux (debut);

-- Nouvelles permissions (matrice « Rôles et droits », US-33)
INSERT INTO permissions (id_permission, code, description) VALUES
  (12, 'SUPERVISION_CONSULTER', 'Superviser l''activité des cliniques'),
  (13, 'SYNTHESE_CONSULTER',    'Consulter la synthèse d''activité de la Direction'),
  (14, 'MAINTENANCE_GERER',     'Annoncer une maintenance'),
  (15, 'DEMANDES_TRAITER',      'Traiter les demandes d''export ou de suppression des données');
INSERT INTO role_permission (id_role, id_permission)
SELECT r.id_role, p.id_permission
  FROM (VALUES
    ('AGENT_ADMIN', 'SUPERVISION_CONSULTER'), ('ADMIN', 'SUPERVISION_CONSULTER'), ('DIRECTION', 'SUPERVISION_CONSULTER'),
    ('DIRECTION', 'SYNTHESE_CONSULTER'), ('ADMIN', 'SYNTHESE_CONSULTER'),
    ('ADMIN', 'MAINTENANCE_GERER'),
    ('ADMIN', 'DEMANDES_TRAITER')
  ) AS m(role, permission)
  JOIN roles r ON r.code = m.role
  JOIN permissions p ON p.code = m.permission;
