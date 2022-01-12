
exports.CatAbonents = class CatAbonents extends Object {

  db(cachable) {
    const {job_prm: {server}, adapters: {pouch}} = this._manager._owner.$p;
    return server.abonents.length < 2 && !server.single_db ? pouch.remote[cachable] : this.server.db(this, cachable);
  }

  toJSON() {
    const {ref, id, name, no_mdm, servers} = this;
    return {
      ref,
      id,
      name,
      no_mdm,
      servers: servers._obj.map(({key, proxy, name}) => ({key, proxy, name})),
    };
  }
};
