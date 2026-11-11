-- MedLink — correctif Sprint 3 (US-10) : un créneau libéré par un report doit pouvoir être réservé à nouveau.
-- L'index du Sprint 2 comptait aussi les rendez-vous « reporte » comme occupant leur créneau ;
-- depuis US-10, un rendez-vous reporté libère son créneau : seul un rendez-vous « planifie » l'occupe.
-- Rejouable sans risque.
DROP INDEX IF EXISTS uq_rdv_creneau_actif;
CREATE UNIQUE INDEX uq_rdv_creneau_actif ON rendez_vous (id_creneau) WHERE statut = 'planifie';
