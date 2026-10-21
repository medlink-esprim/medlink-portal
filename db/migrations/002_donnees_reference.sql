-- =============================================================
-- MedLink — données de référence (US-54)
-- Rôles du portail et les trois cliniques du réseau.
-- =============================================================

INSERT INTO roles (id_role, code, libelle) VALUES
  (1, 'PATIENT',     'Patient'),
  (2, 'PRATICIEN',   'Praticien'),
  (3, 'AGENT_ADMIN', 'Agent administratif'),
  (4, 'ADMIN',       'Administrateur du portail'),
  (5, 'DIRECTION',   'Direction');

INSERT INTO cliniques (nom, ville) VALUES
  ('Clinique MedLink Sousse', 'Sousse'),
  ('Clinique MedLink Sfax',   'Sfax'),
  ('Clinique MedLink Tunis',  'Tunis');
