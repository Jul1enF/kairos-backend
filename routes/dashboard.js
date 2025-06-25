var express = require('express');
var router = express.Router();

const mongoose = require('mongoose');

const connectionString = process.env.CONNECTION_STRING;

const User=require('../models/users')

router.post('/getSearches', async(req, res)=>{

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

  
const data = await User.findOne({email : req.body.email}).populate({path: 'searches', populate: {path: 'score'}});
console.log(data)
if (data){
    res.json({result : true, searches : data.searches})
}
else {res.json({result : false})}
})

//ROUTE UPDATE SCORE SKILL USER
router.put('/save-scores', async (req,res) => {

  await mongoose.connect(connectionString, { connectTimeoutMS: 2000 })

  
    User.findOne({ token : req.body.token})
        .then(user => {
            if (user === null) {
                return res.json({ result: false, message: 'Utilisateur non trouvé' });
            }
            User.updateOne(
                { token: req.body.token },
                { skills: req.body.score } 
            )
            .then(() => {
            res.json({ result: true, message: 'Scores mis à jour avec succès' });
            })
        })
})

module.exports = router