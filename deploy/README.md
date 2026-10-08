# Déploiement sur le VPS (phase 8)

Premier déploiement, manuel, de Mementorize sur un VPS OVH : l'application tourne en HTTPS sur un vrai nom de domaine. La phase 10 automatisera tout ça ; ici, chaque commande est tapée à la main, pour comprendre ce que l'automatisation fera plus tard.

```
navigateur ──HTTPS──▶ Traefik (:80, :443) ──(réseau proxy)──▶ web ──▶ api ──▶ postgres
                         │                                          (docker-compose.yml)
                         └── certificats Let's Encrypt
```

- **Traefik** (`deploy/traefik/`) : le seul service exposé sur Internet. Il obtient et renouvelle les certificats HTTPS, redirige HTTP vers HTTPS, et transmet chaque requête au bon conteneur d'après ses *labels*. Il vit dans sa propre pile, à côté de l'application : d'autres services pourront passer par lui plus tard (Uptime Kuma en phase 11, par exemple).
- **L'application** : le même `docker-compose.yml` qu'en local, plus `docker-compose.prod.yml`, qui ne publie plus aucun port et ajoute à `web` les labels de routage pour Traefik.

**Ce qu'il te faut** : l'adresse IPv4 du VPS et ses identifiants (mail d'OVH), un nom de domaine chez OVH, et un terminal PowerShell sur ton PC (le client `ssh` est inclus dans Windows).

Dans tout le guide :

| à remplacer par | exemple |
|-----------------|---------|
| `IP_DU_VPS` | `51.38.x.x` |
| `UTILISATEUR` | l'utilisateur créé par OVH (`ubuntu` ou `debian`, selon l'image), ou le tien |
| `mementorize.mondomaine.fr` | le nom choisi pour l'application |

Les commandes ont été écrites pour Ubuntu 26.04 ou 24.04 et Debian 12 ou 13, les images proposées par OVH. Sur Ubuntu 26.04, `sudo` et les commandes de base (`cp`, `chmod`…) sont des réécritures en Rust (sudo-rs, uutils), compatibles avec l’usage qu’en fait ce guide.

---

## 1. Une clé SSH sur ton PC

Une clé remplace le mot de passe : la partie privée reste sur ton PC, la partie publique va sur le serveur. Si tu as déjà `~/.ssh/id_ed25519`, passe à l'étape 2.

```powershell
ssh-keygen -t ed25519 -C "vincent@mementorize"
# Entrée pour l'emplacement par défaut ; une phrase de passe est recommandée.
```

## 2. Première connexion et mises à jour

```powershell
ssh UTILISATEUR@IP_DU_VPS
```

À la première connexion, `ssh` demande de confirmer l'empreinte du serveur (`yes`), puis le mot de passe reçu par mail ; il peut te demander d'en choisir un nouveau.

Sur le serveur, mettre le système à jour, puis activer les mises à jour de sécurité automatiques :

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # répondre « Yes » / « Oui »
# Si /var/run/reboot-required existe, redémarrer : sudo reboot
```

Si OVH ne t'a donné qu'un accès `root`, crée d'abord ton utilisateur, puis reconnecte-toi avec :

```bash
adduser vincent
usermod -aG sudo vincent
```

## 3. Connexion par clé uniquement

Depuis **ton PC**, copier la clé publique sur le serveur (Windows n'a pas `ssh-copy-id`) :

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh UTILISATEUR@IP_DU_VPS "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Vérifier dans une **nouvelle** fenêtre : `ssh UTILISATEUR@IP_DU_VPS` ne doit plus demander le mot de passe du serveur (seulement la phrase de passe de ta clé, si tu en as mis une).

Ensuite seulement, désactiver les mots de passe et la connexion en `root`, sur le serveur :

```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf > /dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

Pourquoi `10-` : sur les images cloud, un fichier `50-cloud-init.conf` réactive parfois `PasswordAuthentication`. `sshd` lit ces fichiers par ordre alphabétique et garde la **première** valeur rencontrée : `10-` passe avant.

> **Garde la session actuelle ouverte** et teste une nouvelle connexion avant de la fermer : en cas d'erreur, c'est ta seule porte d'entrée. En dernier recours, OVH propose un mode *rescue* et une console KVM dans l'espace client.

## 4. Pare-feu

Seuls SSH, HTTP et HTTPS doivent être joignables :

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **Piège Docker** : un port *publié* par un conteneur (`ports:` dans un fichier Compose) contourne `ufw`, car Docker écrit ses propres règles `iptables`, prioritaires. C'est pour ça que `docker-compose.prod.yml` retire toutes les publications : en production, seul Traefik publie 80 et 443, et la base n'est pas joignable de l'extérieur, pare-feu ou non.

## 5. Mémoire d'échange (si le VPS a moins de 4 Go de RAM)

Le build des images (surtout Next.js) peut demander plus de mémoire qu'un petit VPS n'en a. Vérifier avec `free -h`, et ajouter 2 Go de *swap* si besoin :

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 6. Docker

Le script officiel de Docker ajoute son dépôt `apt` et installe Docker Engine avec le plugin Compose :

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # docker sans sudo
exit                             # puis se reconnecter pour que le groupe s'applique
```

```bash
docker run --rm hello-world
docker compose version
```

Être dans le groupe `docker` revient à être `root` (on peut monter `/` dans un conteneur) : ne l'accorder qu'à ton utilisateur.

Limiter la taille des journaux des conteneurs (par défaut, ils grossissent sans fin) :

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{ "log-driver": "local", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
sudo systemctl restart docker
```

## 7. Le nom de domaine

Dans l'espace client OVH : **Web Cloud → Noms de domaine → ton domaine → Zone DNS → Ajouter une entrée** :

- type **A** ;
- sous-domaine : `mementorize` (pour `mementorize.mondomaine.fr`) ;
- cible : `IP_DU_VPS` ;
- TTL : par défaut.

N'ajoute pas d'entrée **AAAA** (IPv6) pour l'instant, et supprime celle qui existerait déjà pour ce nom : Let's Encrypt essaie l'IPv6 en priorité, et le serveur n'est pas configuré pour.

La propagation prend de quelques minutes à quelques heures. Vérifier depuis ton PC :

```powershell
Resolve-DnsName mementorize.mondomaine.fr -Type A
```

Tant que le nom ne renvoie pas `IP_DU_VPS`, Let's Encrypt ne pourra pas délivrer de certificat : inutile de passer à l'étape 9 avant.

## 8. Récupérer le code et créer les fichiers de configuration

```bash
git clone https://github.com/vincentAgile/mementorize.git ~/mementorize
cd ~/mementorize
docker network create proxy     # réseau partagé entre Traefik et les applications
```

**Traefik** : l'adresse de contact pour Let's Encrypt, et le serveur de *staging* pour le premier essai.

```bash
cd ~/mementorize/deploy/traefik
cp .env.example .env
nano .env
#   ACME_EMAIL="ton.adresse@exemple.fr"
#   décommenter la ligne ACME_CA_SERVER (staging)
```

Le *staging* délivre des certificats que les navigateurs refusent (avertissement), mais ses limites sont bien plus larges : une erreur de configuration ne bloquera pas le domaine plusieurs heures auprès de Let's Encrypt.

**L'application** : générer de vrais secrets, sur le serveur.

```bash
cd ~/mementorize
cp .env.example .env
openssl rand -hex 32    # → JWT_SECRET
openssl rand -hex 24    # → POSTGRES_PASSWORD
nano .env
chmod 600 .env          # lisible par toi seul
```

Dans `.env` :

```bash
JWT_SECRET="<1er résultat>"
POSTGRES_PASSWORD=<2e résultat>
APP_DOMAIN="mementorize.mondomaine.fr"
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

Avec `COMPOSE_FILE`, un simple `docker compose …` utilise les deux fichiers, sans avoir à taper `-f docker-compose.yml -f docker-compose.prod.yml` à chaque fois. `WEB_PORT` ne sert pas en production.

Le mot de passe de la base n'est lu qu'à la **création** du volume : le changer ensuite dans `.env` ne change pas celui de la base existante.

## 9. Lancer

Traefik d'abord :

```bash
cd ~/mementorize/deploy/traefik
docker compose up -d
docker compose logs -f     # Ctrl+C pour quitter
```

Puis l'application (le premier build prend plusieurs minutes) :

```bash
cd ~/mementorize
docker compose up -d --build
docker compose ps          # migrate : Exited (0) ; postgres, api, web : healthy / Up
```

Vérifier depuis ton PC :

```powershell
curl.exe -I http://mementorize.mondomaine.fr     # 308 (ou 301) vers https://
curl.exe -kI https://mementorize.mondomaine.fr   # 307 vers /login (-k : certificat de staging)
```

Le navigateur affiche un avertissement de certificat : c'est normal en *staging*. Dans le détail du certificat, l'émetteur commence par `(STAGING)`.

## 10. Passer au vrai certificat

Une fois le *staging* validé :

```bash
cd ~/mementorize/deploy/traefik
nano .env                                  # recommenter la ligne ACME_CA_SERVER
docker compose down
docker volume rm traefik_letsencrypt       # oublie le certificat de staging
docker compose up -d
docker compose logs -f
```

Après quelques secondes, https://mementorize.mondomaine.fr s'ouvre sans avertissement. Traefik renouvelle le certificat tout seul, avant son expiration.

La base du serveur est neuve : il faut créer un compte. Pour y reprendre les données locales, voir *Sauvegarder et restaurer* plus bas.

---

## Mettre à jour

```bash
cd ~/mementorize
git pull
docker compose up -d --build
```

Compose ne recrée que les conteneurs dont l'image a changé, et `migrate` applique les nouvelles migrations avant que l'API ne redémarre. Le site est indisponible quelques secondes pendant le remplacement : la phase 10 visera le déploiement sans coupure.

## Sauvegarder et restaurer

```bash
cd ~/mementorize
# Sauvegarde (à faire avant chaque mise à jour, au minimum)
docker compose exec -T postgres pg_dump -U mementorize --clean --if-exists mementorize | gzip > ~/backup-$(date +%F).sql.gz
```

Rapatrier une sauvegarde sur ton PC :

```powershell
scp UTILISATEUR@IP_DU_VPS:~/backup-AAAA-MM-JJ.sql.gz .
```

Restaurer, sur la machine qui fait tourner la base, application arrêtée :

```bash
docker compose stop web api
gunzip -c backup-AAAA-MM-JJ.sql.gz | docker compose exec -T postgres psql -U mementorize mementorize
docker compose up -d
```

Le même `pg_dump`, lancé sur ton PC (`docker compose exec -T postgres pg_dump …` dans le dépôt local), puis restauré sur le serveur, y transfère tes fiches locales. Les comptes et les cartes de révision font partie de la base : tout suit.

## Dépannage

| symptôme | piste |
|----------|-------|
| Pas de certificat, ou erreur `acme` dans les logs de Traefik | Le DNS ne pointe pas encore vers le VPS (`Resolve-DnsName`), le port 80 est fermé (`sudo ufw status`), une entrée AAAA existe, ou la limite de Let's Encrypt est atteinte (repasser en *staging*). |
| `404 page not found` (texte brut, servi par Traefik) | Aucune route ne correspond : `APP_DOMAIN` différent du nom tapé, `COMPOSE_FILE` absent de `.env` (labels non appliqués), ou `web` pas démarré. `docker compose config` montre la configuration réellement utilisée. |
| `Bad Gateway` / `Gateway Timeout` | Traefik voit le conteneur mais ne le joint pas : `web` doit être sur le réseau `proxy` (`docker network inspect proxy`). |
| `api` redémarre en boucle | `docker compose logs api` : un `JWT_SECRET` absent ou laissé à `change-me` fait refuser le démarrage, avec le message correspondant. |
| `migrate` en erreur | `docker compose logs migrate` ; l'API ne démarre pas tant que les migrations n'ont pas réussi. |
| Le build s'arrête sans message clair (`Killed`, code 137) | Mémoire insuffisante : voir l'étape 5 (swap). |

Commandes utiles :

```bash
docker compose ps                         # état des services
docker compose logs -f --tail=100 api     # journaux d'un service
docker stats                              # CPU / mémoire des conteneurs
```

---

Sources : [Traefik — Let's Encrypt](https://doc.traefik.io/traefik/https/acme/), [Traefik — Docker provider](https://doc.traefik.io/traefik/providers/docker/), [Docker — Install Docker Engine](https://docs.docker.com/engine/install/), [Docker — ufw](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw), [Let's Encrypt — environnement de staging](https://letsencrypt.org/docs/staging-environment/).
