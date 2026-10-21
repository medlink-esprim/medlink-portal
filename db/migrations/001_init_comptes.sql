-- =============================================================
-- MedLink — Sprint 1 : comptes et authentification (US-54)
-- Exécuté automatiquement par PostgreSQL au premier démarrage
-- du conteneur "db" (dossier /docker-entrypoint-initdb.d).
-- =============================================================

CREATE TYPE statut_compte AS ENUM ('en_attente', 'actif', 'desactive');
CREATE TYPE type_jeton    AS ENUM ('verification_email', 'activation', 'reinitialisation');

CREATE TABLE roles (
  id_role  SMALLINT    PRIMARY KEY,
  code     VARCHAR(20) NOT NULL UNIQUE,
  libelle  VARCHAR(60) NOT NULL
);

CREATE TABLE cliniques (
  id_clinique UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         VARCHAR(80) NOT NULL,
  ville       VARCHAR(40),
  adresse     VARCHAR(200)
);

CREATE TABLE utilisateurs (
  id_utilisateur    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_role           SMALLINT      NOT NULL REFERENCES roles,
  nom               VARCHAR(80)   NOT NULL,
  prenom            VARCHAR(80)   NOT NULL,
  email             VARCHAR(160)  NOT NULL UNIQUE CHECK (email = lower(email)),
  telephone         VARCHAR(20),
  mot_de_passe_hash VARCHAR(255),                 -- NULL tant que le compte n'est pas activé
  statut            statut_compte NOT NULL DEFAULT 'en_attente',
  email_verifie     BOOLEAN       NOT NULL DEFAULT false,
  date_creation     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id_utilisateur UUID        PRIMARY KEY REFERENCES utilisateurs ON DELETE CASCADE,
  numero_dossier VARCHAR(20) NOT NULL UNIQUE,
  date_naissance DATE,
  sexe           CHAR(1)
);

CREATE TABLE praticiens (
  id_utilisateur UUID        PRIMARY KEY REFERENCES utilisateurs ON DELETE CASCADE,
  specialite     VARCHAR(60),
  numero_ordre   VARCHAR(20)
);

CREATE TABLE personnels (
  id_utilisateur UUID        PRIMARY KEY REFERENCES utilisateurs ON DELETE CASCADE,
  fonction       VARCHAR(60),
  id_clinique    UUID        REFERENCES cliniques
);

CREATE TABLE jetons_securite (
  id_jeton       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_utilisateur UUID        NOT NULL REFERENCES utilisateurs ON DELETE CASCADE,
  type           type_jeton  NOT NULL,
  jeton_hash     CHAR(64)    NOT NULL UNIQUE,     -- SHA-256 du jeton envoyé par e-mail
  expire_le      TIMESTAMPTZ NOT NULL,
  utilise        BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX idx_jetons_utilisateur ON jetons_securite (id_utilisateur, type);

-- Numéro de dossier patient : P-<année sur 2 chiffres>-<compteur sur 4 chiffres>
CREATE SEQUENCE patients_numero_seq;
