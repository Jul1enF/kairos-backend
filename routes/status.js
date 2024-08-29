var express = require('express');
var router = express.Router();

//import des models de Schéma
//require('../models/connection');
const User = require('../models/users');
const Search = require('../models/searches');
const Score = require('../models/scores');
const Status_infos = require('../models/status_infos');
const Lbelement = require('../models/lbelements');
const Status = require('../models/status');
const lbelements = require('../codesJuridiquesEntreprises');


// afficher l'utilisateur
router.get('/user', (req, res) => {
    User.find().then(data => {
        res.json({ result: true, data: data });
    })
});

//ajouter une recherche à l'utilisateur
router.post('/user', (req, res) => {
    User.updateOne({ name: req.body.name }, { $push: { searches: req.body.searches } })
        .then((data) => {
            res.json({ result: true, newkey: data })
        })
})

//mettre à jour l'id d'une recherche et effacer la première recherche si plus de 5
router.put('/user', (req, res) => {

    User.findOne({ name: req.body.name }).then(data => {
        /* console.log(data.searches[0]) */
        if (data.searches.length < 3) {
            /* console.log(data.searches.length) */
            User.updateOne({ name: req.body.name }, { searches: req.body.searches })
            res.json({ result: true, newkey: data })
        } else {
            /* console.log(data.searches.length) */
            User.updateOne({ name: req.body.name }, { $pull: { searches: data.searches[0] }, $push: { searches: req.body.searches } })

            res.json({ result: true, newkey: data })
        }

    })
})


//mettre à jour l'id d'un statut_infos et de son score dans la collection research
router.put('/data', (req, res) => {
    Search.updateOne({ _id: req.body._id }, { $set: { score: req.body.score, status_general: req.body.status_general } })
        .then(() => {
            Search.find().then(data => {
                res.json({ result: true, newkeys: data })
            })
        })
})

//mettre à jour statut_id dans la collection status_infos
router.put('/status', (req, res) => {
    Status_infos.updateOne({ _id: req.body._id }, { status_id: req.body.status_id })
        .then(() => {
            Status_infos.find()
                .populate('status_id')
                .then(data => {
                    res.json({ result: true, status: data })
                })
        })
})

// afficher les utilisateurs
router.get('/foreignkey', (req, res) => {
    User.find()
        .populate('searches')
        .then(data => {
            res.json({ result: true, data: data });
        })
});

// afficher lbelement
router.put('/libelle', (req, res) => {
    Lbelement.updateOne({ _id: req.body._id }, { $push: { status_code: req.body.status_code } })

        .then(() => {
            Lbelement.find().then(data => {
                res.json({ result: true, newkeys: data })
            })
        })

})

//créer la liaison avec la clé etrangère searches en fonction de son id pour 1 user
router.put('/link', async (req, res) => {
    //recherche de l'utilisateur
    const userdoc = await User.findOne({ email: req.body.email })
    if (!userdoc) {
        res.json({ result: false, message: "l'email n'existe pas" })
        return
    }
    if (userdoc.searches.includes(req.body.searches)) {
        res.json({ result: false, message: "la recherche existe déjà" })
        return
    }
    //ajout de la clé étrangère (searches) au document user
    userdoc.searches.push(req.body.searches)

    //créer la liaison avec la clé étrangère status_infos avec le document searches
    const searched = await userdoc.populate('searches')
    for (let i = 0; i < searched.searches.length; i++) {
        for (let status of searched.searches[i].top_status) {
            //recherche de la  correspondance de l'intitulé de l'activité avec son code statut dans lbelement
            const statusdata = await Lbelement.find({ status_name: status.status_name })
            for (let name of statusdata) {
                //recherche du document du status détaillé en fonction de son code
                const infodata = await Status_infos.findOne({ status_code: name.status_code })
                if (!infodata) {
                    break
                }
                //console.log(infodata._id)
                const data = await Search.findOne({ _id: searched.searches[i]._id })
                if (data.status_general) {
                    break
                }
                //liaison du document status_infos avec la recherche
                await Search.updateOne({ _id: searched.searches[i]._id }, { $push: { status_general: infodata._id } })
            }
        }
    }
    await userdoc.save()
    res.json({ result: true, data: userdoc })
})


//afficher les 3 status_infos et leur status en fonction du contenu de top status 
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
    console.log(tab)
    res.json({ result: true, data: tab })
})


//afficher les status-infos 
router.get('/status',async (req, res) => {
    const data = await Status_infos.find()
    res.json({result: true, data: data})
})

module.exports = router;