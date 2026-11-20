# US-45 : serveur Vault de MedLink (stockage fichier persistant, réseau Docker interne uniquement)
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1          # trafic interne au réseau Docker, jamais publié sur l'hôte
}
api_addr      = "http://vault:8200"
ui            = false
disable_mlock = true
