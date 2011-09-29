/*
 * Simple file upload server for Node.js
 *
 * The user can upload a file, for which he gets a link so he can share the
 * file with others. Each uploaded file has an associated expiry time, after
 * which it will be removed.
 *
 * Author: Dave van Soest <dave@thebinarykid.nl>
 *
 * Node.js modules needed:
 *  - formidable
 *  - node-mime
 *
 * License: MIT license
*/

var http = require("http");
var url = require("url");
var sys = require("sys");
var fs = require("fs");
var path = require("path");
var formidable = require("./formidable");
var mime = require("./node-mime");


var cwd = process.cwd();
var fileDir = cwd + '/data/file/'; // Make sure this directory exists!
var infoDir = cwd + '/data/info/'; // Make sure this directory exists!

var SERVER_PORT = 8000;
var EXPIRED_FILE_REMOVAL_INTERVAL = 30; // In seconds.
var MAX_FILE_EXPIRY_TIME = 7 * 24 * 60; // In minutes.
var MIN_FILE_EXPIRY_TIME = 1; // In minutes.

function for_each(container, func) {
    if (container instanceof Array) {
        for (var i = 0; i < container.length; ++i) {
            func(container[i], i);
        }
    }
    else if (typeof container === typeof {}) {
        for (var f in container) {
            func(container[f], f);
        }
    }
    else {
        throw new Exception('Object not iterable');
    }
}


var fileInfoCache = {};
function removeExpiredFiles() {
    fs.readdir(infoDir, function(err, files) {
        // Add new files to cache:
        for_each(files, function(file) {
            if (typeof fileInfoCache[file] === 'undefined') {
                fs.readFile(infoDir + file, 'utf8', function(err, data) {
                    fileInfoCache[file] = {};
                    console.log('Added file "' + file + '" to info cache.');
                    var fileInfo = fileInfoCache[file];
                    var lines = data.split('\n');
                    for (var j = 0; j < lines.length; ++j) {
                        var tokens = lines[j].split(':', 2);
                        if (tokens.length == 2) {
                            fileInfo[tokens[0]] = tokens[1];
                        }
                    }
                });
            }
        });

        // Remove expired files:
        var now = (new Date()).getTime();
        var deleteFromCache = [];
        for (var file in fileInfoCache) {
            var fileInfo = fileInfoCache[file];
            if (fileInfo.expire && now > parseInt(fileInfo.expire)) {
                fs.unlink(fileDir + file, function(err) {});
                fs.unlink(infoDir + file, function(err) {});
                deleteFromCache.push(file);
                console.log('Removed expired file "' + file + '"');
            }
        }
        for (var i = 0; i < deleteFromCache.length; ++i) {
            delete fileInfoCache[deleteFromCache[i]];
        }
    });
}
setInterval(removeExpiredFiles, EXPIRED_FILE_REMOVAL_INTERVAL * 1000);
removeExpiredFiles();


var server = http.createServer(function(req, res) {
    var urlPathName = url.parse(req.url).pathname;

    if (urlPathName === '/') {
        display_form(req, res);
    }
    else if (urlPathName === '/receive') {
        upload_file(req, res);
    }
    else if (0 === urlPathName.indexOf('/file/')) {
        download_file(req, res);
    }
    else {
        show_404(req, res);
    }
});
server.listen(SERVER_PORT);


/*
 * Download a file
*/
function download_file(req, res) {
    var parsedUrl = url.parse(req.url, true);
    var fileId = parsedUrl.query.id;

    function fileNotFound() {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end('File not found.\n');
    }

    if (fileId) {
        var filePath = fileDir + fileId;
        path.exists(filePath, function(exists) {
            if (exists) {
                var fileName = path.basename(decodeURIComponent(parsedUrl.pathname));
                var mimeType = mime.lookup(filePath);

                res.writeHead(200, {
                    'Content-Type': mimeType,
                    'Content-Disposition': 'attachment; filename="' + fileName + '"'
                });

                var fileStream = fs.createReadStream(filePath);
                fileStream.on('data', function(chunk) {
                    res.write(chunk);
                });
                fileStream.on('end', function() {
                    res.end();
                });
            }
            else {
                fileNotFound();
            }
        });
    }
    else {
        fileNotFound();
    }
}


/*
 * Display upload form
 */
function display_form(req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end(
        '<form action="/receive" method="post" enctype="multipart/form-data">'+
            '<p><input type="file" name="upload-file-1"></p>'+
            '<p>Expire: <input type="text" name="expire" value="15"> minute(s)</p>'+
            '<input type="submit" value="Upload">'+
        '</form>'
    );
}


/*
 * Handle file upload
 */
function upload_file(req, res) {
    var form = new formidable.IncomingForm();
    form.uploadDir = fileDir;

    form.parse(req, function(err, fields, files) {
        var uploadedFiles = [];

        for (var f in files) {
            var file = files[f];
            if (file.name) {
                uploadedFiles.push(file);

                var fileId = path.basename(file.path);
                var expire = parseInt(fields.expire);
                file.expire = (new Date()).getTime() +
                    Math.min(MAX_FILE_EXPIRY_TIME, Math.max(MIN_FILE_EXPIRY_TIME, isNaN(expire) ? 15 : expire)) * 60000;
                var infoData =
                    'filename:' + file.name + '\n' +
                    'expire:' + file.expire;
                fs.writeFile(infoDir + fileId, infoData, 'utf8');
            }
        }

        if (err) {
            res.writeHead(200, {'content-type': 'text/plain'});
            res.write('Upload error: ' + sys.inspect(err) + '\n');
        }
        else {
            res.writeHead(200, {'content-type': 'text/html'});
            res.write('<p>Upload successful:</p>\n');
            for (var i = 0; i < uploadedFiles.length; ++i) {
                var file = uploadedFiles[i];
                var fileId = path.basename(file.path);
                var expireDate = new Date(file.expire);
                var expireString = '' +
                    expireDate.getFullYear() + '-' + expireDate.getMonth() + '-' + expireDate.getDate() + 
                    ' ' + expireDate.getHours() + ':' + expireDate.getMinutes();
                res.write('<p>' + file.name + ' (' + file.size + ' bytes, expires at: ' + expireString + '): <a href="./file/' + encodeURIComponent(file.name) + '?id=' + fileId + '">' + fileId + '</a></p>\n');
                console.log('File uploaded: ' + file.name + ' (' + file.size + ' bytes)');
            }
        }
        res.end('');
    });
}


/*
 * Handles page not found error
 */
function show_404(req, res) {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.end("Page not found\n");
}

