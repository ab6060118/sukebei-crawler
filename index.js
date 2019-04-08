var http = require('https');
var fs = require('fs');
var Crawler = require("crawler");
var config = require('./config.js')
var admin = require('firebase-admin');
var credential =  require('./credential.json')
var data = {}

admin.initializeApp({
  credential: admin.credential.cert(credential),
  databaseURL: 'https://firbase-practice.firebaseio.com',
  storageBucket: 'gs://firbase-practice-efdb9.appspot.com'
});

var sukebeiBucket = admin.storage().bucket()
var sukebeiCollection = admin.firestore().collection('sukebei')

var c = new Crawler({
  maxConnections : 10,
  callback: function(error, res, done) {
    console.log(data, 'down');
    done()
  }
});

function queryFc2(no) {
  if(!no) {
    console.log('the post number is missing.');
    return
  }

  c.queue({
    uri: config.fc2 + no,
    callback: function(error, res, done) {
      if(error) {
        console.log(error);
      }
      else {
        var $ = res.$
        var imgs = []

        $('section.sample_images a').each(function(index, e) {
          var href = $(e).attr('href')
          if(href && typeof href === 'string' && href.includes('storage') && !href.includes('thumb') && !href.includes('gif')) imgs.push(href);
        });
        $('section.explain a').each(function(index, e) {
          var href = $(e).attr('href')
          if(href && typeof href === 'string' && href.includes('storage') && !href.includes('thumb') && !href.includes('gif')) imgs.push(href);
        });

        imgs.forEach(function(url, index) {
          var filename = url.split('/').pop()

          if(!filename) return;

          var filepath = 'temp/' + filename
          var file = fs.createWriteStream(filepath);
          var request = http.get(url, function(response) {
            var stream = response.pipe(file);
            stream.on('finish', function() {
              sukebeiBucket.upload(filepath, {
                destination: no + '/' + filename,
              }).then(function() {
                fs.unlinkSync(filepath)
              })
            })
          });
        })
      }
      done()
    }
  })
}

function main() {
  c.queue({
    uri: config.sukebei,
    callback: function(error, res, done) {
      if(error) {
        console.log(error);
      }
      else{
        var $ = res.$
        $('.success').each(function(index, e) {
          var reg = /\d{6,}/
          var stringArr = $(e).find('td:nth-child(2) a').text().match(reg)
          var magnet = $(e).find('i.fa-magnet').parent().attr('href')
          var time = $(e).find('td[data-timestamp]').data('timestamp')

          if(!stringArr[0] || !magnet) { return }

          var doc = sukebeiCollection.doc(stringArr[0] + '#' + time)

          doc.get().then(function(snap) {
            if(!snap.exists) {
              doc.set({
                name: stringArr.input,
                no: stringArr[0],
                magnet: magnet,
                time: time
              })

              queryFc2(stringArr[0])
            }
          })
        });
      }
      done()
    }
  })
}

main()
console.log('search');

setInterval(function() {
  main()
  console.log('search');
}, 1000*60*config.interval)

