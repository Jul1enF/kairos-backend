var express = require('express');
var router = express.Router();
require('../models/connection');
const User=require('../models/users')
const Search = require('../models/searches')
const Score = require('../models/scores')


router.post('/registerSearch', async (req, res)=>{
    const {search, email} = req.body

    // Enregistrement de la recherche
/*     const scoreFromId = await Score.findOne({_id: search.score[0]._id})
    const newScore = new Score(scoreFromId)
    const scoreSaved = await newScore.save()
    const scoreId = scoreSaved._id; */

    const newScore = new Score (search.score[0])
    const scoreSaved = await newScore.save()
    const scoreId = scoreSaved._id

    const newSearch = await new Search({
      activity: search.activity,
      area: search.area,
      date: search.date,
      current_companies: search.current_companies,
      top_status: search.top_status,
      score: scoreId,
      status_general: search.status_general,
    })

    //console.log(newSearch, scoreSaved)

    const data = await newSearch.save()

    // Inscription de son id dans le champs searches du user concerné
    const updating = await User.updateOne({email}, {$push:{searches : data._id}})

    // Renvoie des datas nécessaires pour actualiser les reducers
    const userData = await User.findOne({email}).populate({path: 'searches', populate: {path:'score'} });
    /* console.log(userData) */
    const searches = userData.searches
    const allSearchesId = await searches.map(e=>e=e._id)


    res.json({searches, allSearchesId})

})


module.exports = router;