'use strict';

const http = require('http');
const httpProxy = require('http-proxy');
const {createHmac} = require('crypto');
const url = require('url');
const {name, version} = require('../../package.json');
const {user_node, zone, local_storage_prefix} = require('../../config/app.settings')();
const keepAliveAgent = new http.Agent({ keepAlive: true });
const getBody = require('./raw-body');
const {end404} = require('./end');

const headerFields = {
  username: 'X-Auth-CouchDB-UserName',
  roles: 'X-Auth-CouchDB-Roles',
  token: 'X-Auth-CouchDB-Token',
  cookie: 'Cookie',
  clear(headers) {
    for(const field in this){
      if(typeof this[field] === 'string') {
        delete headers[this[field]];
        delete headers[this[field].toLowerCase()];
      }
    }
    delete headers.authorization;
  }
};

// Create a proxy server with custom application logic
const proxy = httpProxy.createProxyServer({
  xfwd: true,
  agent: keepAliveAgent,
});

proxy.on('proxyRes', setVia);

module.exports = function ({cat, job_prm}, log) {

  proxy.on('error', (err) => {
    log(err.message || err, 'error');
  });

  return async function couchdbProxy(req, res) {
    // You can define here your custom logic to handle the request
    // and then proxy the request.

    const {parsed: {query, path, paths, couchdb_proxy_direct}, headers, user}  = req;

    const { username, roles, token } = headerFields;
    headerFields.clear(headers);
    if(user) {
      headers[username] = user.latin || encodeURIComponent(user.id);
      headers[roles] = JSON.parse(user.roles).join(',');
      headers[token] = sign(headers[username], user_node.secret);
    }

    let server;
    if(couchdb_proxy_direct) {
      server = url.parse(`${job_prm.server.couchdb_proxy_base}.${parseInt(headers.host.split('.')[0].replace(/[^+\d]/g, ''), 10)}:5984`);
    }
    else {
      let parts = new RegExp(`/${local_storage_prefix}(.*?)/`).exec(path);
      if((parts && parts[0] === 'meta') || path.includes(`/${local_storage_prefix}meta`)) {
        parts = [zone, 'ram'];
      }
      else if(parts && parts[1]) {
        parts = parts[1].split('_');
      }
      else if(path === '/couchdb/') {
        parts = [zone, ''];
      }
      else {
        return end404(res, path);
      }
      const abonent = cat.abonents.by_id(parts[0]);

      let {branch} = user || {};
      server = branch && branch.server;
      switch (parts[1]) {
      case 'doc':
        while (server.empty() && !branch.parent.empty()) {
          branch = branch.parent;
          server = branch.server;
        }
        if(server.empty()) {
          server = abonent.server;
        }
        break;

      case 'ram':
      case '':
        server = abonent.server;
        break;

      default:
        const row = abonent.ex_bases.find({name: parts[1]});
        server = row ? row.server : abonent.server;
      }

      if(!server && abonent) {
        server = abonent.server;
      }

      if(server.empty()) {
        throw new TypeError(`Не найден сервер для зоны '${parts[0]}'`);
      }
      server = url.parse(server.http);
    }

    if(query && query.includes('feed=longpoll')) {
      const upstreamReq = http.request({
        method: req.method,
        headers: headers,
        hostname: server.hostname,
        port: parseInt(server.port, 10),
        path: path.replace('/couchdb', ''),
        agent: keepAliveAgent,
      }, (upstreamRes) => {
        for(const header in upstreamRes.headers) {
          (header.startsWith('x-couch') || header === 'server') && res.setHeader(header, upstreamRes.headers[header]);
        }
        setVia(upstreamRes, req, res);
        upstreamRes.pipe(res);
      });
      if(req.method === 'POST') {
        try{
          upstreamReq.write(await getBody(req));
        }
        catch(err) {}
      }
      upstreamReq.end();
    }
    else {
      proxy.web(req, res, {
        target: `${server.href.replace(new RegExp(server.path + '$'), '')}${path.replace('/couchdb', '')}`,
        ignorePath: true,
      });
    }
  };

};

// set via header
function setVia(proxyRes, req, res) {
  const existing = res.getHeader('Via');
  const viaheader = `${existing ? existing + ', ' : ''} ${name}/${version}`;
  res.setHeader('Via', viaheader);
}

// couchdb proxy signed token
function sign(user, secret) {
  return createHmac('sha1', secret).update(user).digest('hex');
};



