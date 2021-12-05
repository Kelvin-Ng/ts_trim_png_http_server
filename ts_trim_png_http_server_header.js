const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const fs = require('fs');

const total_to_skip = 8

let m3u8_dir = process.argv[2];
let url_prefix = process.argv[3];

const requestListener = function (req, res) {
    if (req.url.endsWith('.m3u8')) {
        fs.readFile(m3u8_dir + '/' + req.url, function(err, data) {
            if (err) {
                res.writeHead(404);
            } else {
                res.writeHead(200);
                res.end(data);
            }
        });
        return;
    }

    console.log('GET request for ' + req.url);
    console.log(req.headers.range);

    let subreq = https.get(url_prefix + req.url, (subres) => {
        req.on('close', () => {
            subreq.destroy();
            console.log('Client closed GET request for ' + req.url);
        });

        if (subres.statusCode !== 200) {
            console.error(`Did not get an OK from the server. Code: ${subres.statusCode}`);
            subres.resume();
            res.writeHead(subres.statusCode);
            res.end();
        } else {
            res.writeHead(200);

            let received_len = 0;

            subres.on('data', (chunk) => {
                if (received_len >= total_to_skip) {
                    res.write(chunk);
                } else if (received_len + chunk.length >= total_to_skip) {
                    let to_skip = total_to_skip - received_len;
                    res.write(chunk.slice(to_skip));
                }

                received_len += chunk.length;
            });

            subres.on('end', () => {
                res.end();
                console.log('Finished GET request for ' + req.url);
            });
        }
    });
}

const server = http.createServer(requestListener);
server.listen(8080);
