# Politique de l'API : lecture seule du secret de production, rien d'autre
path "secret/data/medlink" {
  capabilities = ["read"]
}
