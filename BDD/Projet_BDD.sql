-- phpMyAdmin SQL Dump
-- version 5.2.1deb1
-- https://www.phpmyadmin.net/
--
-- Hôte : localhost:3306
-- Généré le : lun. 01 déc. 2025 à 09:53
-- Version du serveur : 10.11.6-MariaDB-0+deb12u1
-- Version de PHP : 8.2.7

-- Dump conserve pour rejouer schema + donnees rapidement.
-- Mode SQL stable pour garder des IDs identiques.
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
-- Transaction globale pour importer schema + donnees en bloc.
START TRANSACTION;
-- Timezone fixe pour rendre les dates deterministes.
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
-- Encodage UTF-8 complet pour conserver accents et emojis.
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `Projet_BDD`
--

-- --------------------------------------------------------

--
-- Structure de la table `Categorie`
--

CREATE TABLE `Categorie` (
  `IDcategorie` int(11) NOT NULL,
  `Categorie` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Categorie`
--

INSERT INTO `Categorie` (`IDcategorie`, `Categorie`) VALUES
(1, 'Info'),
(2, 'Elen'),
(3, 'Ener'),
(4, 'Auto'),
(5, 'Oscilloscope'),
(6, 'Outil de mesure'),
(7, 'Generateur');

-- --------------------------------------------------------

--
-- Structure de la table `Emprunt`
--

CREATE TABLE `Emprunt` (
  `IDemprunt` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `DATEdebut` date NOT NULL,
  `DATEfin` date NOT NULL,
  `ETATemprunt` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Emprunt`
--

INSERT INTO `Emprunt` (`IDemprunt`, `IDmateriel`, `IDuser`, `DATEdebut`, `DATEfin`, `ETATemprunt`) VALUES
(1, 1, 1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'En cours'),
(2, 2, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 6 DAY), 'Annulation demandee'),
(3, 3, 3, DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), 'En cours'),
(4, 4, 4, DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'Maintenance'),
(5, 5, 5, DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'En cours'),
(6, 6, 5, DATE_SUB(CURDATE(), INTERVAL 25 DAY), DATE_SUB(CURDATE(), INTERVAL 15 DAY), 'Terminé'),
(7, 7, 5, DATE_SUB(CURDATE(), INTERVAL 15 DAY), DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Terminé'),
(8, 8, 3, DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 17 DAY), 'En cours'),
(9, 2, 1, DATE_SUB(CURDATE(), INTERVAL 40 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'Terminé');

-- --------------------------------------------------------

--
-- Structure de la table `Prolongation`
--

CREATE TABLE `Prolongation` (
  `IDprolongation` int(11) NOT NULL,
  `IDemprunt` int(11) NOT NULL,
  `DATEfinDemande` date NOT NULL,
  `Status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Prolongation`
--

INSERT INTO `Prolongation` (`IDprolongation`, `IDemprunt`, `DATEfinDemande`, `Status`, `CreatedAt`) VALUES
(1, 3, DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'pending', NOW()),
(2, 1, DATE_ADD(CURDATE(), INTERVAL 8 DAY), 'rejected', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- --------------------------------------------------------

--
-- Structure de la table `Materiel`
--

CREATE TABLE `Materiel` (
  `IDmateriel` int(11) NOT NULL,
  `NOMmateriel` text NOT NULL,
  `IDcategorie` int(11) NOT NULL,
  `Emplacement` text NOT NULL,
  `Dispo` enum('Oui','Non') NOT NULL DEFAULT 'Non',
  `NUMserie` text NOT NULL,
  `Etat` text NOT NULL,
  `Image` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Materiel`
--

INSERT INTO `Materiel` (`IDmateriel`, `NOMmateriel`, `IDcategorie`, `Emplacement`, `Dispo`, `NUMserie`, `Etat`, `Image`) VALUES
(1, 'Oscilloscope Rigol DS1054Z', 5, 'B05', 'Non', 'OSC-001', 'Bon', NULL),
(2, 'Multimetre Fluke 87V', 6, 'B01', 'Non', 'MM-087', 'Neuf', NULL),
(3, 'Kit Raspberry Pi 4', 1, 'C02', 'Non', 'INF-004', 'Bon', NULL),
(4, 'Alimentation 0-30V', 2, 'A07', 'Non', 'ELE-030', 'Passable', NULL),
(5, 'Capteur energie', 3, 'D03', 'Non', 'ENE-101', 'Bon', NULL),
(6, 'Robot line follower', 4, 'D05', 'Oui', 'AUT-210', 'Neuf', NULL),
(7, 'Generateur de fonctions', 7, 'B02', 'Oui', 'GEN-210', 'Bon', NULL),
(8, 'Analyseur logique USB', 1, 'C05', 'Oui', 'INF-LOG', 'Bon', NULL);

-- --------------------------------------------------------

--
-- Structure de la table `Rendu`
--

CREATE TABLE `Rendu` (
  `IDrendu` int(11) NOT NULL,
  `IDemprunt` int(11) NOT NULL,
  `DATErendu` date NOT NULL,
  `ETATrendu` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Rendu`
--

INSERT INTO `Rendu` (`IDrendu`, `IDemprunt`, `DATErendu`, `ETATrendu`) VALUES
(1, 6, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'Bon -> Passable'),
(2, 7, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Bon'),
(3, 9, DATE_SUB(CURDATE(), INTERVAL 29 DAY), 'Bon');

-- --------------------------------------------------------

--
-- Structure de la table `Notification`
--

CREATE TABLE `Notification` (
  `IDnotification` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `Message` text NOT NULL,
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Seen` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Notification`
--

INSERT INTO `Notification` (`IDnotification`, `IDuser`, `Message`, `CreatedAt`, `Seen`) VALUES
(1, 1, 'Votre réservation a été annulée suite à une maintenance planifiée.', NOW(), 0),
(2, 5, 'Votre demande de prolongation a été refusée.', NOW(), 0);

-- --------------------------------------------------------

--
-- Structure de la table `MaintenanceRequest`
--

CREATE TABLE `MaintenanceRequest` (
  `IDmaintenance` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `DATEdebut` date NOT NULL,
  `DATEfin` date NOT NULL,
  `Status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `MaintenanceRequest`
--

INSERT INTO `MaintenanceRequest` (`IDmaintenance`, `IDmateriel`, `IDuser`, `DATEdebut`, `DATEfin`, `Status`, `CreatedAt`) VALUES
(1, 6, 4, DATE_ADD(CURDATE(), INTERVAL 3 DAY), DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'pending', NOW());

-- --------------------------------------------------------

--
-- Structure de la table `ReservationRequest`
--

CREATE TABLE `ReservationRequest` (
  `IDreservation` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `DATEdebut` date NOT NULL,
  `DATEfin` date NOT NULL,
  `Status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `CreatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `ReservationRequest`
--

INSERT INTO `ReservationRequest` (`IDreservation`, `IDmateriel`, `IDuser`, `DATEdebut`, `DATEfin`, `Status`, `CreatedAt`) VALUES
(1, 8, 5, DATE_ADD(CURDATE(), INTERVAL 4 DAY), DATE_ADD(CURDATE(), INTERVAL 6 DAY), 'pending', NOW());

-- --------------------------------------------------------

--
-- Structure de la table `Role`
--

CREATE TABLE `Role` (
  `IDrole` int(11) NOT NULL,
  `Role` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Role`
--

INSERT INTO `Role` (`IDrole`, `Role`) VALUES
(1, 'Eleve'),
(2, 'Professeur'),
(3, 'Technicien'),
(4, 'Administrateur');

-- --------------------------------------------------------

--
-- Structure de la table `User`
--

CREATE TABLE `User` (
  `IDuser` int(11) NOT NULL,
  `Couriel` text NOT NULL,
  `MDP` text NOT NULL,
  `NOMuser` text NOT NULL,
  `IDrole` int(11) NOT NULL,
  `DATEcreation` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `User`
--

INSERT INTO `User` (`IDuser`, `Couriel`, `MDP`, `NOMuser`, `IDrole`, `DATEcreation`) VALUES
(1, 'test.test@gmail.com', '1234', 'testtruc', 1, CURDATE()),
(2, 'admin@geii.fr', 'admin', 'admin', 4, CURDATE()),
(3, 'prof@geii.fr', 'prof', 'prof', 2, CURDATE()),
(4, 'tech@geii.fr', 'tech', 'tech', 3, CURDATE()),
(5, 'retard@geii.fr', 'retard', 'retard', 1, CURDATE());

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `Categorie`
--
ALTER TABLE `Categorie`
  ADD PRIMARY KEY (`IDcategorie`);

--
-- Index pour la table `Emprunt`
--
ALTER TABLE `Emprunt`
  ADD PRIMARY KEY (`IDemprunt`);

--
-- Index pour la table `Prolongation`
--
ALTER TABLE `Prolongation`
  ADD PRIMARY KEY (`IDprolongation`),
  ADD KEY `idx_prolongation_emprunt` (`IDemprunt`);

--
-- Contraintes pour la table `Prolongation`
--
ALTER TABLE `Prolongation`
  ADD CONSTRAINT `fk_prolongation_emprunt` FOREIGN KEY (`IDemprunt`) REFERENCES `Emprunt` (`IDemprunt`) ON DELETE CASCADE;

--
-- Index pour la table `Materiel`
--
ALTER TABLE `Materiel`
  ADD PRIMARY KEY (`IDmateriel`);

--
-- Index pour la table `Rendu`
--
ALTER TABLE `Rendu`
  ADD PRIMARY KEY (`IDrendu`);

--
-- Index pour la table `Notification`
--
ALTER TABLE `Notification`
  ADD PRIMARY KEY (`IDnotification`),
  ADD KEY `idx_notification_user_seen` (`IDuser`, `Seen`);

--
-- Index pour la table `MaintenanceRequest`
--
ALTER TABLE `MaintenanceRequest`
  ADD PRIMARY KEY (`IDmaintenance`),
  ADD KEY `idx_maint_req_material` (`IDmateriel`),
  ADD KEY `idx_maint_req_user` (`IDuser`);

--
-- Index pour la table `ReservationRequest`
--
ALTER TABLE `ReservationRequest`
  ADD PRIMARY KEY (`IDreservation`),
  ADD KEY `idx_res_req_material` (`IDmateriel`),
  ADD KEY `idx_res_req_user` (`IDuser`);

--
-- Index pour la table `Role`
--
ALTER TABLE `Role`
  ADD PRIMARY KEY (`IDrole`);

--
-- Index pour la table `User`
--
ALTER TABLE `User`
  ADD PRIMARY KEY (`IDuser`);

--
-- Contraintes pour la table `MaintenanceRequest`
--
ALTER TABLE `MaintenanceRequest`
  ADD CONSTRAINT `fk_maint_req_material` FOREIGN KEY (`IDmateriel`) REFERENCES `Materiel` (`IDmateriel`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_maint_req_user` FOREIGN KEY (`IDuser`) REFERENCES `User` (`IDuser`) ON DELETE CASCADE;

--
-- Contraintes pour la table `ReservationRequest`
--
ALTER TABLE `ReservationRequest`
  ADD CONSTRAINT `fk_res_req_material` FOREIGN KEY (`IDmateriel`) REFERENCES `Materiel` (`IDmateriel`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_res_req_user` FOREIGN KEY (`IDuser`) REFERENCES `User` (`IDuser`) ON DELETE CASCADE;

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `Categorie`
--
ALTER TABLE `Categorie`
  MODIFY `IDcategorie` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT pour la table `Emprunt`
--
ALTER TABLE `Emprunt`
  MODIFY `IDemprunt` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `Prolongation`
--
ALTER TABLE `Prolongation`
  MODIFY `IDprolongation` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `Materiel`
--
ALTER TABLE `Materiel`
  MODIFY `IDmateriel` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT pour la table `Rendu`
--
ALTER TABLE `Rendu`
  MODIFY `IDrendu` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `Notification`
--
ALTER TABLE `Notification`
  MODIFY `IDnotification` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `MaintenanceRequest`
--
ALTER TABLE `MaintenanceRequest`
  MODIFY `IDmaintenance` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT pour la table `ReservationRequest`
--
ALTER TABLE `ReservationRequest`
  MODIFY `IDreservation` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT pour la table `Role`
--
ALTER TABLE `Role`
  MODIFY `IDrole` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `User`
--
ALTER TABLE `User`
  MODIFY `IDuser` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
