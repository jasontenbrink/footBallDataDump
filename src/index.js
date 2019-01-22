'use strict';

require('dotenv').load({silent: true});
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const util = require ('util');
const mongoose = require('mongoose');
const axios = require('axios');
const moment = require('moment')



const db = mongoose.connect('mongodb://localhost/nfl_teams');

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const teamSchema = new Schema({
     name: String,
     teamId: String,
     seasons: Array
})

const Team = mongoose.model('Team', teamSchema);
const weeks = [];
const seasons = ['2016', '2017', '2018'];
const teams = {};

seasons.forEach(season => {
  axios.get(`https://api.ngs.nfl.com/league/schedule?season=${season}&seasonType=REG`)
  .then(res => {
    
    const firstGameOfTheSeason = res.data.reduce((currentMin, value) => (
      currentMin.isoTime < value.isoTime ? currentMin : value 
    ))

    const weeks = populateWeeks(firstGameOfTheSeason.isoTime)

    res.data.forEach(game => {
      if (!teams[game.homeNickname]){

        //create new team in team object
        teams[game.homeNickname] = {
          teamId: game.homeTeam.teamId,
          seasons: {
            [seasons[0]]: [],
            [seasons[1]]: [],
            [seasons[2]]: [],
          }
        };
      }

      const weekScore = getWeekandScore('home', game, weeks);  //return {week3: {opponent: chiefs, gameId: 123, Q1: 2, ...}}
      teams[game.homeNickname].seasons[season].push(weekScore);

      if(!teams[game.visitorNickname]) {
        teams[game.visitorNickname] = {
          teamId: game.visitorTeam.teamId,
          seasons: {
            [seasons[0]]: [],
            [seasons[1]]: [],
            [seasons[2]]: [],
          }
        };
      }

      const weekScore1 = getWeekandScore('visitor', game, weeks);  //return {week3: {opponent: chiefs, gameId: 123, Q1: 2, ...}}
      teams[game.visitorNickname].seasons[season].push(weekScore1); 
    })

    //convert object of teams to array of teams for insertMany
    const arrayOfTeams = Object.keys(teams).map(teamName => ({
      name: teamName,
      ...teams[teamName],
      seasons: addByeWeek(teams[teamName].seasons)
    }))

    console.log(arrayOfTeams);
    Team.insertMany(arrayOfTeams, (err, docs) => {
      console.log('docs', docs)
    })
  })
})

function addByeWeek(seasons) {
  Object.keys(seasons).forEach(season => {
    let byeWeek = '';
    const weeks = []
    for (let i = 1; i < 18; i++){weeks.push(i)}
    weeks.map(week => {
      const hasWeek = seasons[season].find(game => {
        return game.week === week
      })
      if(!hasWeek){
        byeWeek = week
      }
    })

    seasons[season].push({week: byeWeek, byeWeek: true})
  })
  return seasons;
}

function getWeekandScore(homeOrVisitor, game, weeks) {
  const opponent = homeOrVisitor === 'home' ? game.visitorNickname : game.homeNickname;

  const week = getWeek(game.isoTime, weeks);
  return {
    week,
    ...game.score[`${homeOrVisitor}TeamScore`], opponent, gameId: game.gameId
  }
}

function getWeek(date, weeks) {
  //Thursday through Monday are 1 week.  first week starts on date of first game in response from nfl api.
  //at top of loop grab first date and generate a range of dates for all 17 weeks
  const gameDate = moment(date)
  const week = weeks.find(week => {
    return week.startDate < gameDate && gameDate < week.endDate 
  })
  return week.name;
}

function populateWeeks(seed) {
  const weeks =[]
  const startDate = moment(1536279600000).subtract(1, 'day');
  const endDate = moment(1536279600000).add(5, 'days');

  for (let i = 0; i < 17; i++) {
    weeks.push({
      name: i+1,
      startDate: startDate.clone(),
      endDate: endDate.clone()
    })
    startDate.add(1, 'week');
    endDate.add(1, 'week');
  }

  return weeks;
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get('/', (req, res) => {
  res.json({message: 'hi mom'})
});

app.set('port', process.env.PORT || 3000);

app.listen(app.get('port'), () => {
  util.log('listening on port ', app.get('port'))
})