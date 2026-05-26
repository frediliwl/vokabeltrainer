# Deployment

## Lokal testen (vor dem Deployen)

```bash
cd __kiro-workspace/projects/vokabeltrainer
python3 -m http.server 8000
```

Dann im Browser: http://localhost:8000

Auf dem Mac kannst du die App auch mit dem iPhone im selben WLAN testen:

```bash
# IP-Adresse des Mac herausfinden
ipconfig getifaddr en0
# Dann auf dem iPhone: http://<IP>:8000
```

## GitHub Pages

### Einmaliges Setup
1. GitHub-Account haben (falls nicht: https://github.com/signup)
2. Neues Repository anlegen, z.B. `vokabeltrainer` (public)
3. Im Terminal:

```bash
cd __kiro-workspace/projects/vokabeltrainer
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<DEIN-USERNAME>/vokabeltrainer.git
git push -u origin main
```

4. Auf GitHub: Repository → Settings → Pages
5. Source: "Deploy from a branch"
6. Branch: `main`, Folder: `/ (root)`
7. Save

Nach 1-2 Minuten ist die App erreichbar unter:
`https://<DEIN-USERNAME>.github.io/vokabeltrainer/`

### Auf dem Handy installieren
1. URL im Safari/Chrome auf dem Handy öffnen
2. Teilen-Button → "Zum Home-Bildschirm hinzufügen"
3. Fertig — App-Icon liegt jetzt auf dem Homescreen

### Updates deployen
```bash
git add .
git commit -m "Update"
git push
```

GitHub Pages aktualisiert automatisch (1-2 Minuten).

## Wichtig
- Deine Vokabeln werden im Browser deines Handys gespeichert (LocalStorage)
- Nutze den **CSV-Export** in den Einstellungen regelmäßig als Backup
- Wenn du die App von einem anderen Gerät aus nutzt, sind das getrennte Vokabel-Sätze
