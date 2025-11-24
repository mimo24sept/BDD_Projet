<h1 align="center">✨ SAE – Gestion d’un parc de matériels ✨</h1>

<p align="center">
  <span style="background: linear-gradient(90deg, #5ac8fa, #34c759, #ffcc00); color:#0f172a; padding:6px 12px; border-radius:12px; font-weight:700;">
    GEII S5 · Base de données · Application web
  </span>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stack-PostgreSQL_|_Node_|_React-0ea5e9?style=flat-square&logo=postgresql&logoColor=white" alt="Stack badge" />
  <img src="https://img.shields.io/badge/Objectif-Gestion%20de%20parc-22c55e?style=flat-square" alt="Objectif badge" />
  <img src="https://img.shields.io/badge/Méthodo-SAE-orange?style=flat-square" alt="Metho badge" />
</p>

---

## 🚀 Contexte
Le département GEII possède un parc de matériel (oscilloscopes, générateurs, cartes électroniques) prêté aux étudiants et enseignants. L’objectif est de créer une application web pour suivre les prêts, la maintenance et l’état du matériel.

## 🎯 Objectifs pédagogiques
- Développer un système de gestion de stocks et de prêts.
- Mettre en place un suivi des retards et de la maintenance.
- Générer des statistiques d’utilisation.

## 🧩 Fonctionnalités attendues
- Authentification et gestion des rôles.
- Catalogue du matériel avec fiche technique (photo, état, localisation).
- Réservation et prêt avec dates de retour.
- Gestion des retards et envoi d’alertes.
- Module de maintenance (historique, coûts, planning).
- Export des données (Excel, PDF).

<details>
<summary>📌 Contraintes & livrables (cliquer pour déplier)</summary>

### Contraintes
- Interface ergonomique.
- Sauvegarde régulière des données.

### Livrables
- Code source et base de données.
- Scripts d’installation et de sauvegarde.
- Manuel utilisateur et technique.
</details>

## 🗺️ Parcours utilisateur (suggestion)
- **Administrateur** : configure le parc, gère les rôles, pilote les maintenances.
- **Enseignant/Élève** : consulte le catalogue, réserve, suit ses prêts et retours.
- **Technicien** : suit les maintenances, renseigne l’état et les coûts.

## 🎨 Maquette rapide (structure cible)
```text
Accueil → Connexion
        → Tableau de bord (prêts en cours, retards, alertes)
Catalogue → Fiches matérielles → Réservation
Maintenance → Historique → Planning → Dépenses
Exports → Excel / PDF
```

## 🛠️ Démarrage rapide (à adapter)
```bash
git clone <url>
cd BDD_Projet
# Backend
cd backend && npm install && npm run dev
# Frontend
cd ../frontend && npm install && npm run dev
```

## ✅ Check-list de fin de SAE
- [ ] Auth & rôles fonctionnels.
- [ ] CRUD matériel + fiches techniques.
- [ ] Flux de prêt/réservation complet (création → retour → retard → alerte).
- [ ] Module maintenance avec historique et coûts.
- [ ] Exports Excel/PDF opérationnels.
- [ ] Sauvegardes documentées + scripts testés.
- [ ] Manuels utilisateur et technique livrés.
