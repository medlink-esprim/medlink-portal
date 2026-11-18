-- =============================================================
-- MedLink — Sprint 4 : espace praticien (patients, dossier, comptes-rendus,
-- résultats, agenda multi-sites) et back-office (comptes, cliniques, accueil).
-- Modèle logique de données du Sprint 4.
--
-- Nouvelle base : exécuté automatiquement après 001 à 005.
-- Base existante :
--   docker compose exec -T db psql -U medlink -d medlink -v ON_ERROR_STOP=1 < db/migrations/006_sprint4.sql
-- =============================================================

-- US-47 : journal des accès aux dossiers médicaux (qui, quoi, quand).
-- Pas de clé étrangère : une ligne du journal reste lisible même si le compte est supprimé.
CREATE TABLE journal_acces_dossiers (
  id_acces       BIGSERIAL    PRIMARY KEY,
  date_acces     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  id_utilisateur UUID         NOT NULL,
  role           VARCHAR(20)  NOT NULL,
  id_patient     UUID         NOT NULL,
  id_document    UUID,
  action         VARCHAR(30)  NOT NULL CHECK (action IN (
                   'consultation_dossier', 'consultation_document', 'telechargement_document',
                   'redaction_compte_rendu', 'publication_document')),
  adresse_ip     INET
);
CREATE INDEX idx_journal_acces_patient     ON journal_acces_dossiers (id_patient, date_acces DESC);
CREATE INDEX idx_journal_acces_utilisateur ON journal_acces_dossiers (id_utilisateur, date_acces DESC);

-- Le journal est en ajout seul : aucune ligne ne peut être modifiée ni supprimée.
CREATE FUNCTION journal_acces_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Le journal des accès aux dossiers est en ajout seul (US-47)';
END $$;
CREATE TRIGGER trg_journal_acces_ajout_seul
  BEFORE UPDATE OR DELETE ON journal_acces_dossiers
  FOR EACH ROW EXECUTE FUNCTION journal_acces_ajout_seul();

-- US-24 : un compte-rendu par consultation, texte chiffré (AES-256-GCM, US-43).
-- S'il est visible du patient, sa version PDF est publiée dans le dossier (id_document).
CREATE TABLE comptes_rendus (
  id_compte_rendu UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_rdv          UUID        NOT NULL UNIQUE REFERENCES rendez_vous ON DELETE CASCADE,
  id_praticien    UUID        NOT NULL REFERENCES praticiens ON DELETE CASCADE,
  contenu_chiffre BYTEA       NOT NULL,
  visible_patient BOOLEAN     NOT NULL DEFAULT true,
  id_document     UUID        REFERENCES documents_medicaux ON DELETE SET NULL,
  date_redaction  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comptes_rendus_praticien ON comptes_rendus (id_praticien, date_redaction DESC);

-- US-24 / US-25 : auteur d'un document publié (NULL : document publié par script)
ALTER TABLE documents_medicaux
  ADD COLUMN id_auteur UUID REFERENCES utilisateurs ON DELETE SET NULL;

-- US-20 : alertes du praticien lues dans son agenda
ALTER TABLE notifications ADD COLUMN lue_le TIMESTAMPTZ;

-- US-29 : une affectation retirée est désactivée, pas supprimée (l'historique des plages reste)
ALTER TABLE praticien_clinique
  ADD COLUMN actif     BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN date_maj  TIMESTAMPTZ NOT NULL DEFAULT now();

-- US-28 : date de désactivation d'un compte (l'historique du compte est conservé)
ALTER TABLE utilisateurs ADD COLUMN date_desactivation TIMESTAMPTZ;

-- US-30 : agent qui a pris le rendez-vous par téléphone (origine « accueil »)
ALTER TABLE rendez_vous ADD COLUMN id_createur UUID REFERENCES utilisateurs ON DELETE SET NULL;

-- US-25 : nouvelle permission, accordée au praticien
INSERT INTO permissions (id_permission, code, description) VALUES
  (11, 'RESULTAT_PUBLIER', 'Publier un résultat ou un document dans le dossier d''un patient');
INSERT INTO role_permission (id_role, id_permission)
SELECT r.id_role, 11 FROM roles r WHERE r.code = 'PRATICIEN';
