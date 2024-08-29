var express = require('express');
var router = express.Router();

//import des models de Schéma
require('../models/connection');
const Status_infos = require('../models/status_infos');
const Status = require('../models/status')

//afficher les infos détaillées (status_infos) des 3 top_status d'une recheche
router.post('/status_infos', async (req, res) => {
    //console.log(req.body._ids)
    const tab = []
    for (let i = 0; i < 3; i++) {
        let status_code = req.body._ids[i]
        //console.log(status_code)
        const statusData = await Status_infos.findById(status_code)
        .populate('status_id')
        .then(data => {
            /* console.log(data) */
            tab.push(data)
        }) 
    }
    //console.log(tab)
    res.json({ result: true, data: tab })
})


//afficher les status-infos 
router.get('/status',async (req, res) => {
    const data = await Status_infos.find()
    res.json({result: true, data: data})
})

module.exports = router;