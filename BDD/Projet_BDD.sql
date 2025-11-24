-- phpMyAdmin SQL Dump
-- version 5.2.1deb1
-- https://www.phpmyadmin.net/
--
-- Hôte : localhost:3306
-- Généré le : lun. 24 nov. 2025 à 10:23
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
-- Structure de la table `Catégorie`
--

CREATE TABLE `Catégorie` (
  `IDcategorie` int(11) NOT NULL,
  `Categorie` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Catégorie`
--

INSERT INTO `Catégorie` (`IDcategorie`, `Categorie`) VALUES
(1, 'Oscilloscope'),
(2, 'Outil de mesure'),
(3, 'Generateur');

-- --------------------------------------------------------

--
-- Structure de la table `Inventaire`
--

CREATE TABLE `Inventaire` (
  `IDinventaire` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `Num_serie` text NOT NULL,
  `Etat` text NOT NULL,
  `Remarque` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Inventaire`
--

INSERT INTO `Inventaire` (`IDinventaire`, `IDmateriel`, `Num_serie`, `Etat`, `Remarque`) VALUES
(1, 1, 'DSOX1102A', 'Bon', ''),
(2, 2, 'DSOX1102B', 'usé', ''),
(3, 3, 'WF10XZO', 'a maintenir', ''),
(4, 4, 'M17RBZ34', 'Bon', '');

-- --------------------------------------------------------

--
-- Structure de la table `maintenance`
--

CREATE TABLE `maintenance` (
  `IDmaintenance` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `Type` text NOT NULL,
  `Date_prevu` date NOT NULL,
  `Cout` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `maintenance`
--

INSERT INTO `maintenance` (`IDmaintenance`, `IDmateriel`, `Type`, `Date_prevu`, `Cout`) VALUES
(1, 3, 'Corrective', '2025-12-02', 127);

-- --------------------------------------------------------

--
-- Structure de la table `Matériels`
--

CREATE TABLE `Matériels` (
  `IDmateriel` int(11) NOT NULL,
  `NOMmateriel` text NOT NULL,
  `IDcategorie` int(11) NOT NULL,
  `Emplacement` text NOT NULL,
  `Statut` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Matériels`
--

INSERT INTO `Matériels` (`IDmateriel`, `NOMmateriel`, `IDcategorie`, `Emplacement`, `Statut`) VALUES
(1, 'Oscilloscope', 1, 'B-07', 1),
(2, 'Oscilloscope', 1, 'B-07', 0),
(3, 'GBF', 3, 'Club robot', 0),
(4, 'Multimetre', 2, 'B-14', 1);

-- --------------------------------------------------------

--
-- Structure de la table `Pret`
--

CREATE TABLE `Pret` (
  `IDpret` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `Retour` date NOT NULL,
  `Retour_effectif` date NOT NULL,
  `Etat_retour` text NOT NULL,
  `Remarque` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `Roles`
--

CREATE TABLE `Roles` (
  `IDrole` int(11) NOT NULL,
  `Role` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `Roles`
--

INSERT INTO `Roles` (`IDrole`, `Role`) VALUES
(1, 'Utilisateur'),
(2, 'Administrateur');

-- --------------------------------------------------------

--
-- Structure de la table `réservation`
--

CREATE TABLE `réservation` (
  `IDreservation` int(11) NOT NULL,
  `IDmateriel` int(11) NOT NULL,
  `IDuser` int(11) NOT NULL,
  `Debut` date NOT NULL,
  `Statut` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `réservation`
--

INSERT INTO `réservation` (`IDreservation`, `IDmateriel`, `IDuser`, `Debut`, `Statut`) VALUES
(1, 2, 2, '2025-11-26', 'Confirmé'),
(2, 1, 3, '2025-11-26', 'Refusé');

-- --------------------------------------------------------

--
-- Structure de la table `User`
--

CREATE TABLE `User` (
  `IDuser` int(11) NOT NULL,
  `Couriel` text NOT NULL,
  `MDP` text NOT NULL,
  `NOMuser` text NOT NULL,
  `ID_role` int(11) NOT NULL,
  `DATE_creation` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déchargement des données de la table `User`
--

INSERT INTO `User` (`IDuser`, `Couriel`, `MDP`, `NOMuser`, `ID_role`, `DATE_creation`) VALUES
(1, 'test.test@gmail.com', '1234', 'testtruc', 1, '2025-11-24'),
(3, 'Alexandre.nissen@gmail.com', 'xilpanda', 'Xilophobe', 2, '2025-11-24');

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `Catégorie`
--
ALTER TABLE `Catégorie`
  ADD PRIMARY KEY (`IDcategorie`);

--
-- Index pour la table `Inventaire`
--
ALTER TABLE `Inventaire`
  ADD PRIMARY KEY (`IDinventaire`);

--
-- Index pour la table `maintenance`
--
ALTER TABLE `maintenance`
  ADD PRIMARY KEY (`IDmaintenance`);

--
-- Index pour la table `Matériels`
--
ALTER TABLE `Matériels`
  ADD PRIMARY KEY (`IDmateriel`);

--
-- Index pour la table `Pret`
--
ALTER TABLE `Pret`
  ADD PRIMARY KEY (`IDpret`);

--
-- Index pour la table `Roles`
--
ALTER TABLE `Roles`
  ADD PRIMARY KEY (`IDrole`);

--
-- Index pour la table `réservation`
--
ALTER TABLE `réservation`
  ADD PRIMARY KEY (`IDreservation`);

--
-- Index pour la table `User`
--
ALTER TABLE `User`
  ADD PRIMARY KEY (`IDuser`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `Catégorie`
--
ALTER TABLE `Catégorie`
  MODIFY `IDcategorie` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT pour la table `Inventaire`
--
ALTER TABLE `Inventaire`
  MODIFY `IDinventaire` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `maintenance`
--
ALTER TABLE `maintenance`
  MODIFY `IDmaintenance` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT pour la table `Matériels`
--
ALTER TABLE `Matériels`
  MODIFY `IDmateriel` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT pour la table `Pret`
--
ALTER TABLE `Pret`
  MODIFY `IDpret` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `Roles`
--
ALTER TABLE `Roles`
  MODIFY `IDrole` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT pour la table `réservation`
--
ALTER TABLE `réservation`
  MODIFY `IDreservation` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT pour la table `User`
--
ALTER TABLE `User`
  MODIFY `IDuser` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
