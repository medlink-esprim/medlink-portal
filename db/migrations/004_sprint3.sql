-- =============================================================
-- MedLink — Sprint 3 : droits, anti brute-force, consentement,
-- préférences, annulation / report, notifications, documents
-- (modèle logique de données du Sprint 3).
--
-- Nouvelle base : exécuté automatiquement après 001 à 003.
-- Base existante :
--   docker compose exec -T db psql -U medlink -d medlink -v ON_ERROR_STOP=1 < db/migrations/004_sprint3.sql
-- =============================================================

-- US-33 : un rôle accorde un ensemble de permissions, modifiable par l'administrateur
CREATE TABLE permissions (
  id_permission SMALLINT     PRIMARY KEY,
  code          VARCHAR(60)  NOT NULL UNIQUE,
  description   VARCHAR(200)
);

CREATE TABLE role_permission (
  id_role       SMALLINT NOT NULL REFERENCES roles ON DELETE CASCADE,
  id_permission SMALLINT NOT NULL REFERENCES permissions ON DELETE CASCADE,
  PRIMARY KEY (id_role, id_permission)
);

INSERT INTO permissions (id_permission, code, description) VALUES
  (1,  'DOSSIER_PROPRE',        'Consulter son propre dossier'),
  (2,  'DOSSIER_PATIENTS',      'Consulter le dossier de ses patients'),
  (3,  'COMPTE_RENDU_REDIGER',  'Rédiger un compte-rendu'),
  (4,  'RDV_POUR_PATIENT',      'Créer un rendez-vous pour un patient'),
  (5,  'COMPTES_GERER',         'Gérer les comptes utilisateurs'),
  (6,  'STATS_EXPORTER',        'Exporter des statistiques anonymisées'),
  (7,  'AUDIT_CONSULTER',       'Consulter le journal d''audit'),
  (8,  'ROLES_GERER',           'Gérer les rôles et les droits'),
  (9,  'RDV_PRENDRE',           'Prendre et gérer ses rendez-vous'),
  (10, 'DISPONIBILITES_GERER',  'Publier ses disponibilités');

-- Matrice initiale (maquette « Rôles et droits ») : moindre privilège,
-- aucun rôle administratif n'accède aux données médicales nominatives.
INSERT INTO role_permission (id_role, id_permission)
SELECT r.id_role, p.id_permission
  FROM (VALUES
    ('PATIENT', 'DOSSIER_PROPRE'), ('PATIENT', 'RDV_PRENDRE'),
    ('PRATICIEN', 'DOSSIER_PATIENTS'), ('PRATICIEN', 'COMPTE_RENDU_REDIGER'), ('PRATICIEN', 'DISPONIBILITES_GERER'),
    ('AGENT_ADMIN', 'RDV_POUR_PATIENT'), ('AGENT_ADMIN', 'COMPTES_GERER'), ('AGENT_ADMIN', 'STATS_EXPORTER'),
    ('ADMIN', 'COMPTES_GERER'), ('ADMIN', 'AUDIT_CONSULTER'), ('ADMIN', 'ROLES_GERER'),
    ('DIRECTION', 'STATS_EXPORTER')
  ) AS m(role, permission)
  JOIN roles r ON r.code = m.role
  JOIN permissions p ON p.code = m.permission;

-- US-41 : anti brute-force
ALTER TABLE utilisateurs
  ADD COLUMN tentatives_echouees SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN verrouille_jusqua   TIMESTAMPTZ;

-- US-04 : consentement versionné et historisé (date, version, IP)
CREATE TABLE consentements (
  id_consentement   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_patient        UUID        NOT NULL REFERENCES patients ON DELETE CASCADE,
  version_politique VARCHAR(10) NOT NULL,
  date_consentement TIMESTAMPTZ NOT NULL DEFAULT now(),
  adresse_ip        INET
);
CREATE INDEX idx_consentements_patient ON consentements (id_patient, date_consentement DESC);

-- US-12 / US-15 : préférences de notification (absence de ligne = valeurs par défaut)
CREATE TABLE preferences_notification (
  id_patient   UUID    PRIMARY KEY REFERENCES patients ON DELETE CASCADE,
  email_actif  BOOLEAN NOT NULL DEFAULT true,
  sms_actif    BOOLEAN NOT NULL DEFAULT false,
  rappel_actif BOOLEAN NOT NULL DEFAULT true
);

-- US-09 / US-10 : annulation et report
ALTER TABLE rendez_vous
  ADD COLUMN date_annulation TIMESTAMPTZ,
  ADD COLUMN id_rdv_origine  UUID REFERENCES rendez_vous;

-- US-08 / US-12 / US-48 : notifications envoyées ou programmées
CREATE TYPE type_notification AS ENUM ('confirmation', 'rappel', 'modification', 'annulation', 'resultat', 'alerte');

CREATE TABLE notifications (
  id_notification UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  id_destinataire UUID              NOT NULL REFERENCES utilisateurs ON DELETE CASCADE,
  id_rdv          UUID              REFERENCES rendez_vous ON DELETE CASCADE,
  type            type_notification NOT NULL,
  canal           VARCHAR(10)       NOT NULL CHECK (canal IN ('email', 'sms')),
  statut          VARCHAR(10)       NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'envoyee', 'echec')),
  date_programmee TIMESTAMPTZ       NOT NULL DEFAULT now(),
  date_envoi      TIMESTAMPTZ,
  -- US-48 : un rappel (et toute notification liée à un rendez-vous) n'est envoyé qu'une fois
  UNIQUE (id_rdv, type, canal)
);
CREATE INDEX idx_notifications_destinataire ON notifications (id_destinataire, date_programmee DESC);

-- US-13 / US-14 : dossier médical et documents (fichiers chiffrés hors base)
CREATE TYPE type_document AS ENUM ('resultat', 'compte_rendu', 'ordonnance', 'autre');

CREATE TABLE dossiers_medicaux (
  id_dossier           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_patient           UUID        NOT NULL UNIQUE REFERENCES patients ON DELETE CASCADE,
  antecedents_chiffres BYTEA,
  date_creation        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents_medicaux (
  id_document      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_dossier       UUID          NOT NULL REFERENCES dossiers_medicaux ON DELETE CASCADE,
  type             type_document NOT NULL,
  titre            VARCHAR(120)  NOT NULL,
  chemin_fichier   VARCHAR(255)  NOT NULL,
  empreinte_sha256 CHAR(64)      NOT NULL,
  date_publication TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_dossier ON documents_medicaux (id_dossier, date_publication DESC);
