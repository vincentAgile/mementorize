# MEM-93 — essai d'Azure Pronunciation Assessment

Story d'exploration : **rien n'est mis en production**. Ce dossier ne sert qu'à l'essai, et il n'est pas fusionné dans `main`. Sur le VPS, il vit dans `~/essai-mem93`, à part de l'application.

| Fichier            | Rôle                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `items.json`       | Les 20 éléments : 10 mots, 5 expressions, 5 phrases, avec une suggestion de faute pour chacun.        |
| `enregistrer.html` | Page à ouvrir dans le navigateur, pour enregistrer chaque élément deux fois (soignée, fautive).       |
| `essai.mjs`        | Script d'évaluation : conversion audio, appel à l'API avec texte de référence, mesures, compte rendu. |
| `run.sh`           | Lance le script dans un conteneur jetable (512 Mo, 1 processeur), sans toucher à l'application.       |

## 1. Créer la ressource Azure (une fois, environ 5 minutes)

1. Sur [portal.azure.com](https://portal.azure.com) : **Créer une ressource**, puis chercher **Speech** (« Azure AI services | Speech »), puis **Créer**.
2. **Région** : _France Central_ (ou _West Europe_). **Niveau tarifaire** : **Free F0**. Un seul F0 est permis par abonnement.
3. Une fois la ressource créée : **Clés et point de terminaison**. Noter la **clé 1** et la **région** (par exemple `francecentral`).
4. Ne rien activer d'autre. La journalisation des enregistrements est désactivée par défaut, et le script ne la demande pas.

## 2. Enregistrer (environ 15 minutes)

1. Télécharger `enregistrer.html` et l'ouvrir dans **Chrome** (double clic, puis autoriser le micro).
2. Pour chaque élément : une prononciation **soignée**, puis une **fautive**. La suggestion de faute est affichée, mais vous pouvez en inventer une autre.
3. **Télécharger enregistrements.zip**.
4. Facultatif, pour tester le format MP4/AAC : refaire 2 ou 3 éléments dans **Safari** (iPhone ou Mac). Renommer ce second fichier `enregistrements-safari.zip`.

## 3. Lancer l'essai sur le VPS

```bash
mkdir -p ~/essai-mem93 && cd ~/essai-mem93
B=https://raw.githubusercontent.com/vincentAgile/mementorize/spike/MEM-93-azure/spikes/MEM-93-azure
for f in essai.mjs items.json run.sh; do curl -fsSLO "$B/$f"; done
nano .env          # deux lignes, sans # devant :
                   #   AZURE_SPEECH_KEY="<clé 1>"
                   #   AZURE_SPEECH_REGION="francecentral"
chmod 600 .env
```

Depuis le PC, envoyer les enregistrements :

```powershell
scp enregistrements.zip UTILISATEUR@IP_DU_VPS:~/essai-mem93/
```

Puis, sur le VPS :

```bash
cd ~/essai-mem93 && sh run.sh
```

Compter environ 2 minutes : 80 appels à l'API, en OGG et en WAV, plus les essais de formats. Le script affiche une ligne par enregistrement, puis produit `resultats.tar.gz`. Celui-ci contient le compte rendu brut (`compte-rendu.md`), le tableau (`resume.csv`) et toutes les réponses JSON.

Pour le format Safari : `rm -rf enregistrements && cp enregistrements-safari.zip enregistrements.zip && sh run.sh`.

Rapatrier les résultats et les joindre à la conversation :

```powershell
scp UTILISATEUR@IP_DU_VPS:~/essai-mem93/resultats.tar.gz .
```

## 4. Nettoyer

```bash
rm -rf ~/essai-mem93
docker image rm node:24-alpine   # sans effet sur l'application, qui a ses propres images
```

La ressource Azure peut rester (offre gratuite) si MEM-90 est lancé, ou être supprimée depuis le portail.
