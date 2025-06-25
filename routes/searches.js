var express = require('express');
var router = express.Router();
let base64 = require('base-64')

const Search = require('../models/searches')
const Status_infos = require('../models/status_infos')
const User = require('../models/users')
const Score = require('../models/scores')

const mongoose = require('mongoose');

const connectionString = process.env.CONNECTION_STRING;

const lbElementsList = require('../datas/lbElementsList')
const nbEntreprisesApe = require('../datas/nbEntreprisesCodeApe')

const { toWGS, convertCodeStatusToString, convertCodeEmployeesToString, convertCodeApeToString, convertInPreviousYear, convertStatusStringToCode } = require('../modules/convertingFunctions')

const moment = require('moment')

const apiKey = process.env.SIRENE_API_KEY



router.post('/newSearch', async (req, res) => {

  if (mongoose.connection.readyState !== 1) {
    console.log("NO DB CONNEXION")
    await mongoose.connect(connectionString, { connectTimeoutMS: 6000 })
  }

  const { city, nafCode, token, email, postcode } = req.body

  // Ancien fetch ancienne adresse Sirene

  // const response = await fetch(`https://api.insee.fr/entreprises/sirene/V3.11/siret?q=activitePrincipaleUniteLegale:${nafCode} AND libelleCommuneEtablissement:${city}&nombre=1000`, {
  //   method: 'GET',
  //   headers: {
  //     'Authorization': `Bearer ${apiKey}`,
  //   },
  // })

  const response = await fetch(`https://api.insee.fr/api-sirene/3.11/siret?q=activitePrincipaleUniteLegale:${nafCode} AND libelleCommuneEtablissement:${city}&nombre=1000`, {
    method: 'GET',
    headers: {
      'X-INSEE-Api-Key-Integration': apiKey
    },
  })

  const data = await response.json()

  // Réponse si aucune entreprise trouvée

  if (data.header.statut == 404) {
    res.json({ result: "Aucune entreprise trouvée pour ce type d'activité dans ce secteur." });
    return
  }

  // Tri pour garder les établissements situés dans la ville exacte recherchée

  const cityWithSpaces = city.replace(/-/g, ' ').toUpperCase()
  const cityInUpperCase = city.toUpperCase()

  let companiesInTheRigthCity = data.etablissements.filter(e => e.adresseEtablissement.libelleCommuneEtablissement === cityInUpperCase || cityWithSpaces)


  // Si la ville est Paris, Marseille ou Lyon avec code postal d'arrondissement, tri pour ne garder que les établissements dans cet arrondissement.

  if (postcode) {
    if (city == "Marseille" || city == "Paris" || city == "Lyon") {
      companiesInTheRigthCity = companiesInTheRigthCity.filter(e => e.adresseEtablissement.codePostalEtablissement == postcode)
    }
  }

  // Tri des datas pour ne garder que les établissements encore ouverts ainsi qu'avec des coordonnés et un nom d'établissement

  const actualOpenCompanies = companiesInTheRigthCity.filter(e => e.periodesEtablissement[0].etatAdministratifEtablissement !== "F" && e.uniteLegale.denominationUniteLegale !== null && e.uniteLegale.denominationUniteLegale !== "[ND]" && e.adresseEtablissement.coordonneeLambertAbscisseEtablissement !== null && e.adresseEtablissement.coordonneeLambertAbscisseEtablissement !== "[ND]")

  // Réponse si aucun établissement encore ouvert

  if (actualOpenCompanies.length == 0) {
    res.json({ result: "Aucune entreprise trouvée pour ce type d'activité dans ce secteur." });
    return
  }

  // Création de la date de la recherche et mise en forme pour recherches

  const date = new Date()
  const yearForSearches = moment(date).format("YYYY")

  // Création du sous document current_companies

  let current_companies = actualOpenCompanies.map(e => {

    // Création des coordinées si présentes, ou adresse, ou rien.

    let coordinates

    if (e.adresseEtablissement.coordonneeLambertAbscisseEtablissement !== null && e.adresseEtablissement.coordonneeLambertAbscisseEtablissement !== "[ND]") {
      const companyCoordinates = toWGS(e.adresseEtablissement.coordonneeLambertAbscisseEtablissement, e.adresseEtablissement.coordonneeLambertOrdonneeEtablissement)

      coordinates = {
        latitude: companyCoordinates[0],
        longitude: companyCoordinates[1],
      }
    }
    // else if (e.adresseEtablissement.numeroVoieEtablissement !== null && e.adresseEtablissement.numeroVoieEtablissement !== "[ND]") {
    //   coordinates = {
    //     adresse: `${e.adresseEtablissement.numeroVoieEtablissement} ${e.adresseEtablissement.typeVoieEtablissement} ${e.adresseEtablissement.libelleVoieEtablissement} ${e.adresseEtablissement.codePostalEtablissement} ${e.adresseEtablissement.libelleCommuneEtablissement}`
    //   }
    // }
    // else { coordinates = { localisation: "Non renseignée" } }

    // Création des champs status et employees

    const status = convertCodeStatusToString(e.uniteLegale.categorieJuridiqueUniteLegale)

    let employees

    employees = convertCodeEmployeesToString(e.uniteLegale.trancheEffectifsUniteLegale)

    let name = e.uniteLegale.denominationUniteLegale

    //création de plusieurs chiffres d'affaire
    let ca = Math.round((Math.random() * 99 + 1) * 100) / 100;
    let ca2 = Math.round((Math.random() * 99 + 1) * 100) / 100;
    let ca3 = Math.round((Math.random() * 99 + 1) * 100) / 100;

    const ca_per_year = [
      {
        actual_year: yearForSearches,
        ca,
      },
      {
        year_n_minus_1: convertInPreviousYear(yearForSearches, 1),
        ca: ca2,
      },
      {
        year_n_minus_2: convertInPreviousYear(yearForSearches, 2),
        ca: ca3,
      }
    ]

    e = {
      name,
      status,
      creation_date: e.dateCreationEtablissement,
      employees,
      coordinates,
      ca_per_year,
    }
    return e
  })
  // Sous document current_companies créé. Limitation de son nombre :
  if (current_companies.length > 250) {
    current_companies = current_companies.slice(0, 250)
  }



  // Début tri des statuts

  // Enregistrement d'une liste de tous les statuts

  const allStatus = current_companies.map(e => {
    return e.status
  })

  // Tri en fonction du nombre d'apparitions de chaque statut

  let statusAppearanceTime = allStatus.reduce((accumulator, item) => {
    if (accumulator[item]) {
      ++accumulator[item];
    } else {
      accumulator[item] = 1;
    }
    return accumulator;
  }, {})

  let arrayStatusAppearanceTime = []

  for (let status in statusAppearanceTime) {
    arrayStatusAppearanceTime.push({
      status,
      companiesNumber: statusAppearanceTime[status]
    })
  }

  sortedStatusAppearences = arrayStatusAppearanceTime.sort((a, b) => b.companiesNumber - a.companiesNumber)

  // Nombre total d'entreprises

  const totalCountOfCompanies = actualOpenCompanies.length

  // Création d'une fonction pour trouver le nombre d'entreprise par année

  function getCompaniesNumber(status, year) {
    const allStatusCompanies = data.etablissements.filter(e => {

      const yearSearchedInNumber = Number(year)
      let yearToCompare = e.periodesEtablissement[0].dateDebut.slice(0, 4)
      yearToCompare = Number(yearToCompare)

      let creationYearToCompare = e.dateCreationEtablissement.slice(0, 4)
      creationYearToCompare = Number(creationYearToCompare)

      if (yearToCompare <= yearSearchedInNumber && e.periodesEtablissement[0].etatAdministratifEtablissement === "F") { return }

      else if (e.uniteLegale.categorieJuridiqueUniteLegale !== convertStatusStringToCode(status)) { return }

      else if (creationYearToCompare > yearSearchedInNumber) { return }

      else { return e }
    })
    return allStatusCompanies.length
  }

  // Création des sous-documents detail_top_status en fonction du nombre de status différents trouvés

  let detail_top_status = [
    {
      status_priority: 1,
      status_name: sortedStatusAppearences[0].status,
      percentage: Math.round((sortedStatusAppearences[0].companiesNumber / totalCountOfCompanies) * 100),
      companies_per_year: [
        { actual_year: yearForSearches, number: sortedStatusAppearences[0].companiesNumber },
        {
          year_n_minus_1: convertInPreviousYear(yearForSearches, 1),
          number: getCompaniesNumber(sortedStatusAppearences[0].status, convertInPreviousYear(yearForSearches, 1))
        },
        {
          year_n_minus_2: convertInPreviousYear(yearForSearches, 2),
          number: getCompaniesNumber(sortedStatusAppearences[0].status, convertInPreviousYear(yearForSearches, 2))
        }
      ]
    },]

  if (sortedStatusAppearences.length >= 2) {
    detail_top_status.push(
      {
        status_priority: 2,
        status_name: sortedStatusAppearences[1].status,
        percentage: Math.round((sortedStatusAppearences[1].companiesNumber / totalCountOfCompanies) * 100),
        companies_per_year: [
          { actual_year: yearForSearches, number: sortedStatusAppearences[1].companiesNumber },
          {
            year_n_minus_1: convertInPreviousYear(yearForSearches, 1),
            number: getCompaniesNumber(sortedStatusAppearences[1].status, convertInPreviousYear(yearForSearches, 1))
          },
          {
            year_n_minus_2: convertInPreviousYear(yearForSearches, 2),
            number: getCompaniesNumber(sortedStatusAppearences[1].status, convertInPreviousYear(yearForSearches, 2))
          }
        ]
      },
    )
  }

  if (sortedStatusAppearences.length >= 3) {
    detail_top_status.push(
      {
        status_priority: 3,
        status_name: sortedStatusAppearences[2].status,
        percentage: Math.round((sortedStatusAppearences[2].companiesNumber / totalCountOfCompanies) * 100),
        companies_per_year: [
          { actual_year: yearForSearches, number: sortedStatusAppearences[2].companiesNumber },
          {
            year_n_minus_1: convertInPreviousYear(yearForSearches, 1),
            number: getCompaniesNumber(sortedStatusAppearences[2].status, convertInPreviousYear(yearForSearches, 1))
          },
          {
            year_n_minus_2: convertInPreviousYear(yearForSearches, 2),
            number: getCompaniesNumber(sortedStatusAppearences[2].status, convertInPreviousYear(yearForSearches, 2))
          }
        ]
      },
    )
  }

  // Conversion du code naf en String de sa description

  const activity = convertCodeApeToString(nafCode)

  // Mise au bon Format de la ville (majuscule au début des mots)

  let area = city.toLocaleLowerCase()

  if (area.includes('-')) {
    area = area.split('-')
    area = area.map(e => {
      return e = e[0].toUpperCase() + e.slice(1)
    })
    area = area.join('-')
  } else {
    const firstLetter = area[0].toUpperCase()
    area = firstLetter + area.slice(1)
  }


  // Début création du champs status_general et de ses clefs étrangères

  // Récupération des différentes appellations de status

  const codes = detail_top_status.map(e => {
    const statusName = e.status_name

    const statusCode = lbElementsList.filter(f => f.status_name === statusName)
    return statusCode[0].status_code[0]
  })

  // Récupération des id correspondants aux status

  let status_general = []

  for (let e of codes) {
    const data = await Status_infos.findOne({ status_code: e })
    if (data) {
      status_general.push(data._id)
    }
  }

  // CALCUL SCORE

  // évolution CA : average_ca
  let startCA = 0;
  let endCA = 0;

  for (let company of current_companies) {
    startCA = startCA + company.ca_per_year[2].ca;
    endCA += company.ca_per_year[0].ca;
  };

  const startCaAverage = startCA / current_companies.length;
  const endCaAverage = endCA / current_companies.length;

  const ca_evolution = Math.round(((endCaAverage - startCaAverage) / startCaAverage * 100) * 100) / 100;

  let average_ca = Math.floor(((ca_evolution / 10) + 10) * 2);
  if (average_ca < 0) {
    average_ca = 0;
  } else if (average_ca > 40) {
    average_ca = 40
  }

  // durée de vie moyenne d'une entreprise : average_lifetime
  let averageLifetimeCalc;
  let totalLifetime = 0;


  for (let company of companiesInTheRigthCity) {
    let endingYear;
    const startYear = Number(company.dateCreationEtablissement.slice(0, 4));
    if (company.uniteLegale.etatAdministratifUniteLegale === 'A') {
      endingYear = Number(yearForSearches)
    }
    else (
      endingYear = Number(company.periodesEtablissement[0].dateDebut.slice(0, 4))
    );

    totalLifetime = totalLifetime + (endingYear - startYear)
  }

  averageLifetimeCalc = totalLifetime / companiesInTheRigthCity.length;
  let average_lifetime = Math.floor(averageLifetimeCalc * 2);
  if (average_lifetime > 20) {
    average_lifetime = 20;
  }

  // densité d'entreprises pour une ville : density_of_companies

  const resp = await fetch(`https://geo.api.gouv.fr/communes?nom=${city}&fields=code,nom,population&boost=population`);
  const answ = await resp.json();

  const population = answ[0].population;
  const density = population / current_companies.length;

  const allApeInfos = nbEntreprisesApe.results;

  const apeInfo = allApeInfos.find(e => e.code_ape.slice(0, 2) == nafCode.slice(0, 2) && e.code_ape.slice(2) === nafCode.slice(3))

  let nbCompanies2023;

  if (apeInfo === undefined || apeInfo.nombre_d_etablissements_2023 === 0) {
    nbCompanies2023 = 1;
  }
  else {
    nbCompanies2023 = apeInfo.nombre_d_etablissements_2023;
  }

  const index = 68000000 / nbCompanies2023;

  let density_of_companies = Math.floor((density * 10) / index);
  if (density_of_companies > 20) {
    density_of_companies = 20
  };

  // ratio ouvertures/fermetures sur 3 ans : turnover

  const openedCompanies = companiesInTheRigthCity.filter(e => Number(e.dateCreationEtablissement.slice(0, 4)) >= Number(yearForSearches));

  const closedCompanies = companiesInTheRigthCity.filter(e => e.uniteLegale.etatAdministratifUniteLegale === 'C' && Number(e.periodesEtablissement[0].dateDebut.slice(0, 4)) >= Number(yearForSearches));

  const ratio = Math.floor((openedCompanies.length - closedCompanies.length) * 100 / current_companies.length);

  let turnover;
  if (ratio <= -20 || ratio >= 20) {
    turnover = 0
  }
  else if (ratio === 0) {
    turnover = 20
  }

  else (ratio < 0 ? turnover = 20 + ratio : turnover = 20 - ratio)

  const currentScore = { average_ca, average_lifetime, density_of_companies, turnover }

  // Enregistrement d'une nouvelle recherche en bdd

  if (!token) {
    res.json({
      result: {
        activity,
        area,
        date,
        current_companies,
        top_status: detail_top_status,
        score: [currentScore],
        status_general,
      }
    })
  }

  else {
    const newScore = new Score(currentScore);
    const savedScore = await newScore.save()

    const newSearch = new Search({
      activity,
      area,
      date,
      current_companies,
      top_status: detail_top_status,
      score: savedScore._id,
      status_general,
    })


    // Inscription de l'id de cette recherche dans le document user correspondant 

    const datas = await newSearch.save()

    const returnedData = await Search.findOne({ _id: datas._id }).populate('score');

    const searchKey = await User.updateOne({ email }, { $push: { searches: datas._id } })



    res.json({ result: returnedData, searchForeignKey: datas._id })

  }
})

module.exports = router;
