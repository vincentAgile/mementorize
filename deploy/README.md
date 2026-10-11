# Déploiement sur le VPS (phases 8 et 10)

Mementorize sur un VPS OVH, en HTTPS sur un vrai nom de domaine. La phase 8 a installé le serveur à la main (étapes 1 à 8) ; depuis la phase 10, chaque push sur `main` y est déployé automatiquement, sans coupure (étape 9 pour la mise en place, puis [Déploiement continu](#déploiement-continu-phase-10)).

```
navigateur ──HTTPS──▶ Traefik (:80, :443) ──(réseau proxy)──▶ web ──▶ api ──▶ postgres
                         │                                          (docker-compose.yml)
                         └── certificats Let's Encrypt
```

- **Traefik** (`deploy/traefik/`) : le seul service exposé sur Internet. Il obtient et renouvelle les certificats HTTPS, redirige HTTP vers HTTPS, et transmet chaque requête au bon conteneur d'après ses _labels_. Il vit dans sa propre pile, à côté de l'application : d'autres services pourront passer par lui plus tard (Uptime Kuma en phase 11, par exemple).
- **L'application** : le même `docker-compose.yml` qu'en local, plus `docker-compose.prod.yml`, qui ne publie plus aucun port, remplace les builds par les images publiées par la CI sur `ghcr.io`, et ajoute à `web` les labels de routage pour Traefik.

**Ce qu'il te faut** : l'adresse IPv4 du VPS et ses identifiants (mail d'OVH), un nom de domaine chez OVH, et un terminal PowerShell sur ton PC (le client `ssh` est inclus dans Windows).

Dans tout le guide :

| à remplacer par             | exemple                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| `IP_DU_VPS`                 | `51.38.x.x`                                                                  |
| `UTILISATEUR`               | l'utilisateur créé par OVH (`ubuntu` ou `debian`, selon l'image), ou le tien |
| `mementorize.mondomaine.fr` | le nom choisi pour l'application                                             |

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

> **Garde la session actuelle ouverte** et teste une nouvelle connexion avant de la fermer : en cas d'erreur, c'est ta seule porte d'entrée. En dernier recours, OVH propose un mode _rescue_ et une console KVM dans l'espace client.

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

> **Piège Docker** : un port _publié_ par un conteneur (`ports:` dans un fichier Compose) contourne `ufw`, car Docker écrit ses propres règles `iptables`, prioritaires. C'est pour ça que `docker-compose.prod.yml` retire toutes les publications : en production, seul Traefik publie 80 et 443, et la base n'est pas joignable de l'extérieur, pare-feu ou non.

## 5. Mémoire d'échange (si le VPS a moins de 4 Go de RAM)

Les images sont construites par la CI, pas sur le serveur ; un peu de _swap_ reste une sécurité sur un petit VPS, pendant un déploiement par exemple (deux conteneurs `api` et deux `web` tournent alors quelques secondes). Vérifier avec `free -h`, et ajouter 2 Go si besoin :

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

Tant que le nom ne renvoie pas `IP_DU_VPS`, Let's Encrypt ne pourra pas délivrer de certificat : inutile de passer à l'étape 10 avant.

## 8. Récupérer le code et créer les fichiers de configuration

```bash
git clone https://github.com/vincentAgile/mementorize.git ~/mementorize
cd ~/mementorize
docker network create proxy     # réseau partagé entre Traefik et les applications
```

**Traefik** : l'adresse de contact pour Let's Encrypt, et le serveur de _staging_ pour le premier essai.

```bash
cd ~/mementorize/deploy/traefik
cp .env.example .env
nano .env
#   ACME_EMAIL="ton.adresse@exemple.fr"
#   décommenter la ligne ACME_CA_SERVER (staging)
```

Le _staging_ délivre des certificats que les navigateurs refusent (avertissement), mais ses limites sont bien plus larges : une erreur de configuration ne bloquera pas le domaine plusieurs heures auprès de Let's Encrypt.

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

## 9. Préparer le déploiement continu

Le serveur ne construit pas les images : la CI les publie sur `ghcr.io`, et le workflow _Deploy_ de GitHub vient les installer par SSH. Il faut, une fois pour toutes : l'outil de remplacement sans coupure, une clé SSH réservée à GitHub, et les réglages côté GitHub.

**docker-rollout**, un plugin de la commande `docker` (un script shell). Installé pour tout le système, à une version figée, et vérifié :

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL https://raw.githubusercontent.com/wowu/docker-rollout/v0.14/docker-rollout -o /usr/local/lib/docker/cli-plugins/docker-rollout
echo "cdeaba6ae9eee3b0b606286e585bbda6787283d801a6ad6d9b9d2bc347fda05b  /usr/local/lib/docker/cli-plugins/docker-rollout" | sha256sum -c
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-rollout
docker rollout --version     # docker-rollout version v0.14
```

Pourquoi pas dans `~/.docker/cli-plugins` : le déploiement se connecte à `ghcr.io` dans une configuration Docker temporaire (aucun identifiant ne reste sur le serveur), qui ne voit que les plugins installés pour tout le système.

**La clé de déploiement**, créée sur le serveur, sans phrase de passe (GitHub ne pourrait pas la taper) :

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f ~/deploy_key
echo "command=\"$HOME/mementorize/deploy/deploy.sh\",restrict $(cat ~/deploy_key.pub)" >> ~/.ssh/authorized_keys
cat ~/deploy_key     # à copier en entier, lignes BEGIN et END comprises
```

Le préfixe `command="…",restrict` fait toute la sécurité : quoi que demande une connexion avec cette clé, `sshd` lance `deploy.sh`, sans terminal ni redirection de port. Le script reçoit la demande dans `SSH_ORIGINAL_COMMAND` et n'accepte qu'un SHA de commit de `main`. Une fuite de la clé ne permettrait donc que de redéployer une version existante. Ta propre clé, dans le même fichier, n'est pas concernée.

**L'identité du serveur**, pour que GitHub vérifie qu'il parle bien à ton VPS (remplacer `IP_DU_VPS`) :

```bash
echo "IP_DU_VPS $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
```

**Côté GitHub** : **Settings → Environments → New environment**, nommé `production`.

- **Deployment branches and tags** : _Selected branches and tags_, ajouter `main` (seul `main` peut déployer).
- **Environment secrets** → `DEPLOY_SSH_KEY` : la clé privée affichée par `cat ~/deploy_key`.
- **Environment variables** :

| variable             | valeur                                                  |
| -------------------- | ------------------------------------------------------- |
| `DEPLOY_HOST`        | `IP_DU_VPS`                                             |
| `DEPLOY_USER`        | `UTILISATEUR`                                           |
| `DEPLOY_KNOWN_HOSTS` | la ligne affichée par la commande `echo` ci-dessus      |
| `APP_URL`            | `https://mementorize.mondomaine.fr` (sans `/` à la fin) |

Un _secret_ n'est plus lisible une fois enregistré, et GitHub le masque dans les journaux ; une _variable_ reste visible. Seule la clé privée est secrète : l'adresse du serveur et son identité sont publiques.

Une fois la clé copiée dans GitHub, l'effacer du serveur, où elle n'a rien à faire :

```bash
rm ~/deploy_key ~/deploy_key.pub
```

## 10. Lancer

Traefik d'abord :

```bash
cd ~/mementorize/deploy/traefik
docker compose up -d
docker compose logs -f     # Ctrl+C pour quitter
```

Puis l'application, par le premier déploiement : sur GitHub, **Actions → Deploy → Run workflow**, sur `main`. Le job affiche chaque étape ; à la fin, sur le serveur :

```bash
cd ~/mementorize
docker compose ps          # postgres, api, web : healthy ; images ghcr.io/…:<commit>
```

(`migrate` n'apparaît pas : il s'est arrêté après avoir appliqué les migrations. `docker compose ps -a` le montre, _Exited (0)_.)

Vérifier depuis ton PC :

```powershell
curl.exe -I http://mementorize.mondomaine.fr     # 308 (ou 301) vers https://
curl.exe -kI https://mementorize.mondomaine.fr   # 307 vers /login (-k : certificat de staging)
```

Le navigateur affiche un avertissement de certificat : c'est normal en _staging_. Dans le détail du certificat, l'émetteur commence par `(STAGING)`.

## 11. Passer au vrai certificat

Une fois le _staging_ validé :

```bash
cd ~/mementorize/deploy/traefik
nano .env                                  # recommenter la ligne ACME_CA_SERVER
docker compose down
docker volume rm traefik_letsencrypt       # oublie le certificat de staging
docker compose up -d
docker compose logs -f
```

Après quelques secondes, https://mementorize.mondomaine.fr s'ouvre sans avertissement. Traefik renouvelle le certificat tout seul, avant son expiration.

La base du serveur est neuve : il faut créer un compte. Pour y reprendre les données locales, voir _Sauvegarder et restaurer_ plus bas.

---

## Déploiement continu (phase 10)

### À chaque push sur `main`

La CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) publie les images `ghcr.io/vincentagile/mementorize-{api,migrate,web}:<commit>`. Si tous ses jobs sont au vert, le workflow _Deploy_ ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) se connecte au serveur et lance [`deploy.sh`](./deploy.sh) avec ce commit, puis [`release.sh`](./release.sh), dans la version de ce commit :

1. connexion à `ghcr.io` avec le jeton du job (il expire à la fin du job) ;
2. téléchargement des images du commit ;
3. sauvegarde de la base dans `~/backups` (les 10 dernières sont gardées) ;
4. migrations (`migrate`) : si elles échouent, rien d'autre ne bouge ;
5. remplacement de `api`, puis de `web`, par `docker rollout` : un nouveau conteneur démarre à côté de l'ancien, l'ancien n'est arrêté qu'une fois le nouveau en bonne santé (sinon, c'est le nouveau qui est supprimé, et l'ancien continue de servir) ;
6. `IMAGE_TAG=<commit>` écrit dans `.env` : tout `docker compose …` tapé ensuite à la main vise cette version ;
7. depuis GitHub, un test de fumée sur `APP_URL/login`.

Compter environ une minute (dont 20 s d'attente pour vider l'ancien `web`). Le déroulé est dans l'onglet **Actions** ; la liste des déploiements, sur la page d'accueil du dépôt (_Deployments_). Deux pushes rapprochés : seul le dernier commit de `main` est déployé, et un déploiement attend la fin du précédent.

### Les migrations

Elles s'appliquent _avant_ le remplacement : pendant quelques secondes, l'ancienne version de l'API tourne sur le nouveau schéma. Une migration doit donc rester compatible avec la version précédente du code :

- ajouter une table, une colonne facultative ou avec une valeur par défaut : sans risque ;
- supprimer ou renommer une colonne : en deux déploiements. D'abord le code cesse de s'en servir (et, pour un renommage, la nouvelle colonne est ajoutée et remplie) ; ensuite seulement, une migration la supprime.

Un retour en arrière (ci-dessous) ne défait pas les migrations : c'est la même règle qui le rend possible.

### Redéployer, revenir à une version précédente

Depuis GitHub : **Actions → Deploy → Run workflow**, avec `main` (redéployer le dernier commit) ou le SHA d'un commit plus ancien de `main`. Ses images sont toujours sur `ghcr.io`, et le serveur garde une semaine les images récentes. Le push suivant sur `main` redéploiera la dernière version.

Depuis le serveur, en cas de besoin (SHA complet, 40 caractères) :

```bash
~/mementorize/deploy/deploy.sh <commit>
```

Si les images sont privées (réglage par défaut des paquets GitHub), il faut d'abord `docker login ghcr.io -u <ton-compte-github>`, avec un jeton _classic_ limité à `read:packages`. Les rendre publiques évite ça (le code l'est déjà) : sur GitHub, ton profil → **Packages** → chaque paquet → **Package settings → Change visibility**.

Seuls les commits à partir de la phase 10 sont déployables ainsi : les précédents n'ont ni images publiées, ni `release.sh`.

### Ce qui reste manuel

- **Traefik** (`deploy/traefik`) : une modification de sa configuration ne s'applique qu'avec `cd ~/mementorize/deploy/traefik && docker compose up -d`, après le déploiement qui l'apporte.
- **`.env`** : un nouveau réglage s'y ajoute à la main, avant le déploiement qui en a besoin.
- **`postgres`** : une modification de son service (version de l'image, par exemple) le recrée au déploiement suivant, avec quelques secondes d'interruption.

### Passer un serveur de la phase 8 à la phase 10

Sur le serveur installé en phase 8 :

1. faire l'étape 9 (docker-rollout, clé, réglages GitHub) ;
2. **avant de fusionner** la pull request de la phase 10, amener le dépôt du serveur sur sa branche, pour que `deploy/deploy.sh` existe quand le premier déploiement l'appellera :

   ```bash
   cd ~/mementorize
   git fetch origin
   git checkout --detach origin/phase/10-deploiement-continu
   ```

3. fusionner : la CI publie les images, puis _Deploy_ remplace les conteneurs. Ceux de la phase 8 n'ont pas encore de _healthcheck_ de vidage : ce premier remplacement peut faire échouer quelques requêtes, les suivants non ;
4. supprimer les images construites sur le serveur en phase 8, devenues inutiles : `docker image rm mementorize-api mementorize-migrate mementorize-web`.

## Sauvegarder et restaurer

Chaque déploiement en fait une, dans `~/backups` (`ls -lt ~/backups`). À la main :

```bash
cd ~/mementorize
docker compose exec -T postgres pg_dump -U mementorize --clean --if-exists mementorize | gzip > ~/backup-$(date +%F).sql.gz
```

Rapatrier une sauvegarde sur ton PC :

```powershell
scp UTILISATEUR@IP_DU_VPS:~/backup-AAAA-MM-JJ.sql.gz .
```

Restaurer (une sauvegarde de `~/backups` comme une autre), sur la machine qui fait tourner la base, application arrêtée :

```bash
docker compose stop web api
gunzip -c backup-AAAA-MM-JJ.sql.gz | docker compose exec -T postgres psql -U mementorize mementorize
docker compose up -d
```

Le même `pg_dump`, lancé sur ton PC (`docker compose exec -T postgres pg_dump …` dans le dépôt local), puis restauré sur le serveur, y transfère tes fiches locales. Les comptes et les cartes de révision font partie de la base : tout suit.

## Dépannage

| symptôme                                                     | piste                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pas de certificat, ou erreur `acme` dans les logs de Traefik | Le DNS ne pointe pas encore vers le VPS (`Resolve-DnsName`), le port 80 est fermé (`sudo ufw status`), une entrée AAAA existe, ou la limite de Let's Encrypt est atteinte (repasser en _staging_).                  |
| `404 page not found` (texte brut, servi par Traefik)         | Aucune route ne correspond : `APP_DOMAIN` différent du nom tapé, `COMPOSE_FILE` absent de `.env` (labels non appliqués), ou `web` pas démarré. `docker compose config` montre la configuration réellement utilisée. |
| `Bad Gateway` / `Gateway Timeout`                            | Traefik voit le conteneur mais ne le joint pas : `web` doit être sur le réseau `proxy` (`docker network inspect proxy`).                                                                                            |
| `api` redémarre en boucle                                    | `docker compose logs api` : un `JWT_SECRET` absent ou laissé à `change-me` fait refuser le démarrage, avec le message correspondant.                                                                                |
| `migrate` en erreur                                          | `docker compose logs migrate` ; l'API ne démarre pas tant que les migrations n'ont pas réussi.                                                                                                                      |
| Le build s'arrête sans message clair (`Killed`, code 137)    | Mémoire insuffisante : voir l'étape 5 (swap).                                                                                                                                                                       |
| _Deploy_ : `Host key verification failed`                    | `DEPLOY_KNOWN_HOSTS` ne correspond pas au serveur (adresse, ligne tronquée) : la refaire à l'étape 9.                                                                                                               |
| _Deploy_ : `Permission denied (publickey)`                   | `DEPLOY_SSH_KEY` incomplète (lignes BEGIN et END comprises), `DEPLOY_USER` erroné, ou ligne absente de `~/.ssh/authorized_keys`.                                                                                    |
| _Deploy_ : `deploy.sh: No such file or directory`            | Le dépôt du serveur n'est pas dans `~/mementorize`, ou pas sur un commit de la phase 10 (voir _Passer un serveur de la phase 8 à la phase 10_).                                                                     |
| _Deploy_ : `denied` ou `unauthorized` au téléchargement      | Le workflow n'a pas accès aux paquets : sur GitHub, chaque paquet → **Package settings → Manage Actions access** → ajouter le dépôt, en lecture.                                                                    |
| _Deploy_ : `Files modified on the server`                    | Un fichier suivi par git a été modifié sur le serveur (`git status`) : `git stash`, ou `git checkout -- <fichier>`, puis relancer.                                                                                  |
| _Deploy_ : `New containers are not healthy. Rolling back.`   | La nouvelle version ne démarre pas ; ses journaux sont dans ceux du job. L'ancienne version continue de servir.                                                                                                     |
| `IMAGE_TAG is missing` sur une commande `docker compose`     | Aucun déploiement n'a encore eu lieu sur ce serveur : en lancer un (étape 10).                                                                                                                                      |

Commandes utiles :

```bash
docker compose ps                         # état des services
docker compose logs -f --tail=100 api     # journaux d'un service
docker stats                              # CPU / mémoire des conteneurs
grep IMAGE_TAG .env                       # commit en production
```

---

Sources : [docker-rollout](https://github.com/wowu/docker-rollout), [GitHub — environnements de déploiement](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub — publier sur le Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Docker — healthcheck](https://docs.docker.com/reference/compose-file/services/#healthcheck), [OpenSSH — authorized_keys](https://man.openbsd.org/sshd#AUTHORIZED_KEYS_FILE_FORMAT), [Traefik — Let's Encrypt](https://doc.traefik.io/traefik/https/acme/), [Traefik — Docker provider](https://doc.traefik.io/traefik/providers/docker/), [Docker — Install Docker Engine](https://docs.docker.com/engine/install/), [Docker — ufw](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw), [Let's Encrypt — environnement de staging](https://letsencrypt.org/docs/staging-environment/).
