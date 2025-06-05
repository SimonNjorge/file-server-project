import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { createReadStream , createWriteStream  } from "node:fs";
import { lookup } from "mime-types";
import { stat, readdir, rmdir, unlink } from "node:fs/promises";

let server = createServer((request, response) => {
    let handler = methods[request.method] || notAllowed;
    handler(request).catch(error => {
        if(error.status !== null) return error;
        return {body: String(error), status: 500}
    }).then(({body, status = 200, type = "text/plain"}) => {
        response.writeHead(status, {'content-type': type});
        if(body.pipe) body.pipe(response)
        else response.end(body);

    })
});

server.listen(8000);

const methods = Object.create(null);
const baseDirectory = process.cwd();

// When the value of body is a readable stream, it will have a pipe
//method that we can use to forward all content from a readable stream
//to a writable stream
//console.log( stat('./test'));

function urlPath (url){
    let { pathname } = new URL(url, "http://d");
    let path = resolve(decodeURIComponent(pathname).slice(1));
    if(path !== baseDirectory && 
        !path.startsWith(baseDirectory + sep)) {
            throw {status: 403, body: 'Forbidden'}
        }
    return path;
};

methods.GET = async function (request) {
    let path = urlPath(request.url);
    let stats;
    try {
        stats = await stat(path);
    } catch (error) {
        if(error.code !== 'ENOENT') throw error;
        else return { status: 404, body: 'File not found'}
    }
    if(stats.isDirectory()) {
        return {body: await readdir(path)}
    } else {
        return {
            body: createReadStream(path),
            type: lookup(path)
        }
    }
};
//204 status code indicates no content on http response
methods.DELETE = async function (request) {
    let path = urlPath(request.url);
    let stats;
    try {
        stats = await stat(path);
    } catch (error) {
        if(error.code !== 'ENOENT') throw error;
        else return {status: 204}
    }
    if(stats.isDirectory()) await rmdir(path);
    else await unlink(path);
    return { status: 204}
};

// When pipe is done, it will close the output 
// stream, which causes it to fire a "finish" event. 
function pipeStream (from, to) {
    return new Promise((resolve, reject) => {
        from.on('error', reject);
        to.on('error', reject);
        to.on('finish', resolve);
        //all the data from a readable(request:from) stream being
        // transferred to a writable stream(response:to)
        from.pipe(to); 
    });
};

methods.PUT = async function (request) {
    let path = urlPath(request.url);
    await pipeStream(request, createWriteStream(path));
    return {status: 204}
};

async function notAllowed (request) {
    return {
        status: 405,
        body: `method ${request.method}  not allowed`
    };
};


