var request = require('request');
var fs = require('fs');
var Crawler = require("crawler");
var config = require('./config/config.js')
var admin = require('firebase-admin');
var credential =  require('./config/credential.json')
var hash = require('object-hash');
var thumb = require('node-thumbnail').thumb;
var data = {}

admin.initializeApp({
  credential: admin.credential.cert(credential),
  databaseURL: config.databaseURL,
  storageBucket: config.storageBucket
});

var sukebeiBucket = admin.storage().bucket()
var sukebeiCollection = admin.firestore().collection('sukebeiPosts')

if (!fs.existsSync('./temp')){
  fs.mkdirSync('./temp');
}

var c = new Crawler({
  maxConnections : 1,
  callback: function(error, res, done) {
    console.log(data, 'down');
    done()
  }
});

function queryFc2(hashName, post) {
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
        var promises = []

        if($('section.detail a').attr('href')) imgs.push($('section.detail a').attr('href'))
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

          var promise = new Promise(function(resolve, reject) {
            request(url).pipe(file).on('close', function() {
              thumb({
                suffix: '',
                source: filepath,
                destination: 'temp',
                width: 540,
                quiet: true,
                overwrite: true,
              }).then(function() {
                return sukebeiBucket.upload(filepath, {
                  destination: 'sukebeiPost/' + post.no + '.' + filename,
                }).then(function(res) {
                  if(!post.images) post.images = []
                  var { bucket, name } = res[1]
                  post.images.push(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`)
                  resolve(true)
                  fs.unlink(filepath, function(err) {
                    if (err) {
                      console.error(err, 'unlink error')
                      return
                    }
                  })
                }).catch(function(err) {
                  console.log(err, 'upload error');
                  reject(false)
                })
              }).catch(function(error) {
                console.log(err, 'thumb error');
              })
            })
          })

          promises.push(promise)
        })

        Promise.all(promises).then(function() {
          write_data(hashName, post)
          done()
        }).catch(function(error) {
          console.log(error);
          done()
        })
      }
    }
  })
}

function write_data(name, data) {
  var doc = sukebeiCollection.doc(name)
  var m = new Date();
  var dateString =
    m.getUTCFullYear() + "/" +
    ("0" + (m.getUTCMonth()+1)).slice(-2) + "/" +
    ("0" + m.getUTCDate()).slice(-2) + " " +
    ("0" + m.getUTCHours()).slice(-2) + ":" +
    ("0" + m.getUTCMinutes()).slice(-2) + ":" +
    ("0" + m.getUTCSeconds()).slice(-2);

  doc.set(data).then(function() {
    console.log(`[${dateString}] Write post ${data.no} [${name}] success`);
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

          var post = { name: stringArr.input, no: parseInt(stringArr[0]), magnet: magnet, time: time }
          var name = hash(post)
          var doc = sukebeiCollection.doc(name)
          var m = new Date();
          var dateString =
            m.getUTCFullYear() + "/" +
            ("0" + (m.getUTCMonth()+1)).slice(-2) + "/" +
            ("0" + m.getUTCDate()).slice(-2) + " " +
            ("0" + m.getUTCHours()).slice(-2) + ":" +
            ("0" + m.getUTCMinutes()).slice(-2) + ":" +
            ("0" + m.getUTCSeconds()).slice(-2);

          doc.get().then(snap => {
            if(!snap.exists) {
              queryFc2(name, post)
            }
            else {
              console.log(`[${dateString}] Post ${post.no} [${name}] is exists`);
            }
          })
        });
      }
      done()
    }
  })
}

main()

setInterval(function() {
  main()
}, 1000*60*config.interval)

