-- phpMyAdmin SQL Dump
-- version 5.2.1deb1
-- https://www.phpmyadmin.net/
--
-- Hôte : localhost:3306
-- Généré le : lun. 01 déc. 2025 à 09:53
-- Version du serveur : 10.11.6-MariaDB-0+deb12u1
-- Version de PHP : 8.2.7

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
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
(1, 'Oscilloscope'),
(2, 'Outil de mesure'),
(3, 'Generateur');

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
  `Etat` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Materiel`
--

INSERT INTO `Materiel` (`IDmateriel`, `NOMmateriel`, `IDcategorie`, `Emplacement`, `Dispo`, `NUMserie`, `Etat`) VALUES
(1, 'Osc1', 1, 'B05', 'Non', 'DSOX1102A', 'Bon');

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
(1, 'test.test@gmail.com', '1234', 'testtruc', 1, '2025-11-24'),
(2, 'admin@geii.fr', 'admin', 'admin', 4, '2025-11-24');

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
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `Categorie`
--
ALTER TABLE `Categorie`
  MODIFY `IDcategorie` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

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
  MODIFY `IDmateriel` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

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
-- AUTO_INCREMENT pour la table `Role`
--
ALTER TABLE `Role`
  MODIFY `IDrole` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `User`
--
ALTER TABLE `User`
  MODIFY `IDuser` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
