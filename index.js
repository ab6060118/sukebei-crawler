var http = require('https');
var fs = require('fs');
var Crawler = require("crawler");
var config = require('./config.js')
var admin = require('firebase-admin');
var credential =  require('./credential.json')
var hash = require('object-hash');
var data = {}

admin.initializeApp({
  credential: admin.credential.cert(credential),
  databaseURL: config.databaseURL,
  storageBucket: config.storageBucket
});

var sukebeiBucket = admin.storage().bucket()
var sukebeiCollection = admin.firestore().collection('sukebeiPosts')

var c = new Crawler({
  maxConnections : 10,
  callback: function(error, res, done) {
    console.log(data, 'down');
    done()
  }
});

function queryFc2(post) {
  if(!post) {
    console.log('the post is missing.');
    return
  }

  c.queue({
    uri: config.fc2 + post.no,
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

        console.log(hash(post));

        imgs.forEach(function(url, index) {
          var filename = url.split('/').pop()

          if(!filename) return;

          var filepath = 'temp/' + filename
          var file = fs.createWriteStream(filepath);
          var request = http.get(url, function(response) {
            var stream = response.pipe(file);
            stream.on('finish', function() {
              sukebeiBucket.upload(filepath, {
                destination: 'sukebeiPost/' + post.no + '.' + filename,
              }).then(function(res) {
                console.log(res);
                fs.unlink(filepath, function(err) {
                  if (err) {
                    console.error(err)
                    return
                  }
                })
              }).catch(function(err) {
                console.log(err);
              })
            })
          });
        })
      }
      done()
    }
  })
}

function write_data(data) {
  var doc = sukebeiCollection.doc(hash(data))

  doc.set(data)
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
          if(index !== 0) return
          var reg = /\d{6,}/
          var stringArr = $(e).find('td:nth-child(2) a').text().match(reg)
          var magnet = $(e).find('i.fa-magnet').parent().attr('href')
          var time = $(e).find('td[data-timestamp]').data('timestamp')

          if(!stringArr[0] || !magnet) { return }

          // var doc = sukebeiCollection.doc(stringArr[0] + '#' + time)

          // doc.get().then(function(snap) {
            // if(!snap.exists) {
              // doc.set({
                // name: stringArr.input,
                // no: parseInt(stringArr[0]),
                // magnet: magnet,
                // time: time
              // })

              // queryFc2(stringArr[0])
            // }
          // })
          queryFc2({ name: stringArr.input, no: parseInt(stringArr[0]), magnet: magnet, time: time })
        });
      }
      done()
    }
  })
}

main()
// console.log('search');

// setInterval(function() {
  // main()
  // console.log('search');
// }, 1000*60*config.interval)

