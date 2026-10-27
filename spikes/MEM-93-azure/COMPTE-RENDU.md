# MEM-93 — Compte rendu de l'essai Azure Pronunciation Assessment

Essai du 27 octobre 2026, depuis le VPS de production, dans un conteneur jetable. Configuration : ressource Azure AI Speech **Free F0** en **France Central**, API REST « short audio », `en-US`, texte de référence, granularité phonème, alphabet IPA.

## Échantillon

**4 mots** (_water_, _apple_, _world_, _thorough_), chacun en prononciation soignée et en prononciation fautive. Les enregistrements ont été faits dans Chrome (WebM/Opus).

Deux enregistrements n'ont rien capté d'exploitable :

- _water_ fautive : 0,24 s de silence ;
- _world_ soignée : volume très faible.

Il reste donc **3 paires exploitables**, aucune expression ni phrase, et aucun enregistrement Safari. C'est un échantillon indicatif, pas une validation statistique.

## Pertinence

| Mot      | Soignée : précision / score global | Fautive : précision / score global | Signalé sur la fautive                                   |
| -------- | ---------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| apple    | 89 / 84,2                          | 53 / 22,4                          | _apple_ mal prononcé ; /ə/ 36, /l/ 36, /p/ 52, /æ/ 54    |
| thorough | 70 / 75,9                          | 26 / 8,1                           | _thorough_ mal prononcé ; /ɝ/ 4, /ɹ/ 12, /oʊ/ 28, /θ/ 33 |
| world    | — (rien entendu)                   | 71 / 76,4                          | /w/ 45, /ɝ/ 55                                           |
| water    | 82 / 84                            | — (silence)                        | —                                                        |

- **Les fautes nettes sont bien distinguées** : de 36 à 44 points d'écart en précision, et 62 à 68 points en score global.
- **Les phonèmes signalés sont les bons.** Pour _thorough_ prononcé « tho-rou-gue », Azure pointe le /θ/ et la fin /ɝ ɹ oʊ/. Pour _apple_, la finale /əl/.
- **Rien entendu ≠ mauvaise prononciation.** Quand l'audio est vide ou inaudible, Azure répond quand même `Success`, avec `DisplayText: "."`, `SNR: 0` et le mot en `Omission` à 0. L'application doit le reconnaître pour afficher « Je n'ai rien entendu », et non un 0 décourageant.
- **Le score global (`PronScore`) écrase les mots isolés.** Dès que le mot est mal prononcé, la fluidité et la complétude tombent à 0, et la prosodie compte. Sur un mot seul, **la précision (`AccuracyScore`) est plus lisible**.
- **Stabilité à vérifier.** Le même enregistrement (_thorough_ soigné) a obtenu 75,9 en OGG et 19,1 en WAV. Les 7 autres enregistrements donnent le même score à 3 points près dans les deux formats.

## Temps de réponse depuis le VPS (mots)

| Étape                               | Médiane    | Maximum    |
| ----------------------------------- | ---------- | ---------- |
| Conversion WebM → OGG/Opus (ffmpeg) | 173 ms     | 187 ms     |
| Conversion WebM → WAV 16 kHz        | 119 ms     | 135 ms     |
| Appel à l'API                       | 331 ms     | 483 ms     |
| **Total (OGG)**                     | **477 ms** | **670 ms** |

Le délai perçu reste **sous 0,7 s pour un mot**. Les expressions et les phrases n'ont pas été mesurées ; il faut s'attendre à un temps d'API proportionnel à la durée de l'audio.

## Formats et conversion

- La documentation de l'API REST n'annonce que **WAV PCM 16 kHz mono** et **OGG/Opus**.
- Le WebM envoyé tel quel (`audio/webm; codecs=opus`) a reçu un `200 Success`. Mais l'essai a porté par hasard sur l'enregistrement vide : on ne sait pas s'il a vraiment été décodé.
- **Pas de conclusion sur le WebM direct, ni sur le MP4 de Safari** (non enregistré).
- **Hypothèse sûre** : conversion avec **ffmpeg** côté API (0,1 à 0,2 s), à ajouter à l'image Docker de l'API.

## Confidentialité

- La **journalisation des enregistrements et des transcriptions est désactivée par défaut**. Elle ne s'active que par requête (`storeAudio=true`, que nous n'utilisons pas) ou sur un point de terminaison personnalisé (non utilisé). Activée, elle conserve les journaux 30 jours.
- La ressource est en **France Central**, une région européenne.
- La clé n'est que dans le `.env` du VPS (`chmod 600`), jamais dans le dépôt.

## Coût

- **Offre gratuite F0** : **5 heures d'audio par mois** en reconnaissance temps réel, de quoi couvrir des milliers d'évaluations de 2 à 4 s.
- **Au-delà, la page officielle ne permet pas de conclure** : elle n'affiche pas les montants, à vérifier dans le calculateur Azure.
  - Elle range « Pronunciation Assessment (prosody) » dans les **options facturées en plus**, à l'heure et par option.
  - Une source tierce (juillet 2026) indique 1,00 $/h pour la reconnaissance et 0,30 $/h par option, soit environ 1,30 $/h. Une réponse non officielle du forum Microsoft donne 1,32 $/h.
  - Le libellé « (prosody) » laisse penser que seule l'évaluation de la prosodie est facturée en option.
- **Usage personnel** : 50 évaluations de 3 s par jour font environ 1,3 h par mois. C'est **dans l'offre gratuite**.
- **Quelques utilisateurs** (5 × 50 par jour) : environ 6,3 h par mois, soit à peu près 1,3 h facturée, **moins de 2 $ par mois**.

## Seuils d'appréciation proposés pour MEM-91

On s'appuie sur la **précision** (`AccuracyScore`), mot par mot, plutôt que sur le score global :

| Cas          | Condition                                                                 | Message                                                        |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Rien entendu | `DisplayText` vide ou « . », ou `SNR` à 0, ou tous les mots en `Omission` | « Je n'ai rien entendu : rapproche-toi du micro et réessaie. » |
| Très bien    | précision ≥ 80                                                            | « Très bien ! »                                                |
| Presque      | 60 ≤ précision < 80                                                       | « Presque : attention à /…/ » (phonèmes < 60)                  |
| À reprendre  | précision < 60 ou mot en `Mispronunciation`                               | « À reprendre : /…/ », avec la voix de référence               |

Ces seuils sont à réajuster après les premières semaines d'usage réel.

## Recommandation

**Lancer MEM-90, avec des ajustements :**

1. Afficher la **précision par mot**, pas le score global. Ne pas activer la prosodie : elle est inutile pour des mots isolés, et c'est sans doute l'option facturée.
2. Détecter le cas **« rien entendu »** et le traiter à part.
3. **Convertir avec ffmpeg** côté API vers un format documenté.
4. **Premier jalon de MEM-90, sur l'offre gratuite** : compléter l'échantillon.
   - Expressions et phrases.
   - Safari / MP4.
   - WebM direct sur un vrai enregistrement.
   - Plusieurs passages du même audio en OGG et en WAV, pour lever le doute sur la stabilité.
   - Retenir alors **un seul** format d'envoi.
5. Garder **France Central**, la journalisation désactivée, et la clé dans le `.env` uniquement.
6. Confirmer le tarif dans le calculateur ou sur la première facture, avant d'ouvrir l'évaluation à d'autres utilisateurs.

Exemples de réponses JSON : `exemples/`. Tableau complet : `exemples/resume.csv`.
