
// конструктор metadata.js
import MetaEngine from 'metadata-core';
import plugin_pouchdb from 'metadata-pouchdb';
import plugin_ui from 'metadata-abstract-ui';
import plugin_ui_tabulars from 'metadata-abstract-ui/tabulars';
import plugin_react from 'metadata-react/plugin';
import adapter_memory from 'pouchdb-adapter-memory';
import proxy_login from 'metadata-superlogin/proxy';

// функция установки параметров сеанса
import settings from '../../config/app.settings';

// читаем скрипт инициализации метаданных, полученный в результате выполнения meta:prebuild
const meta_init = require('wb-core/dist/init');
const proxy_init = require('../../src/metadata/init');
import modifiers from './modifiers';

// генераторы действий и middleware для redux
//import {combineReducers} from 'redux';
import {addMiddleware} from 'redux-dynamic-middlewares';
import {metaActions, metaMiddleware} from 'metadata-redux';

import on_log_in from '../../server/metadata/on_log_in';
import load_ram from './common/load_ram';

// подключаем плагины к MetaEngine
MetaEngine
  .plugin(plugin_pouchdb)     // подключаем pouchdb-адаптер к прототипу metadata.js
  .plugin(plugin_ui)          // подключаем общие методы интерфейса пользователя
  .plugin(plugin_ui_tabulars) // подключаем методы экспорта табличной части
  .plugin(plugin_react);      // подключаем react-специфичные модификаторы к scheme_settings

// создаём экземпляр MetaEngine и экспортируем его глобально
const $p = global.$p = new MetaEngine();

// параметры сеанса инициализируем сразу
$p.wsql.init(settings);

// со скрипом инициализации метаданных, так же - не затягиваем
meta_init($p);
proxy_init($p);

// скрипт инициализации в привязке к store приложения
export function init(store) {

  const {dispatch} = store;

  // подключаем metaMiddleware
  addMiddleware(metaMiddleware($p));

  // сообщяем адаптерам пути, суффиксы и префиксы
  const {wsql, job_prm, adapters: {pouch}, classes, cat} = $p;

  classes.PouchDB
    .plugin(adapter_memory)
    .plugin(proxy_login(true));

  pouch.init(wsql, job_prm);

  pouch.on({
    on_log_in() {
      return on_log_in($p.record_log)({pouch, classes, job_prm, cat})
        .then(() => load_ram({pouch, classes, job_prm, cat}));
    },
    pouch_doc_ram_loaded() {
      !pouch.props.user_node && pouch.emit('pouch_complete_loaded');
    },
  });


  // выполняем модификаторы
  modifiers($p, dispatch);

  // информируем хранилище о готовности MetaEngine
  dispatch(metaActions.META_LOADED($p));

  // читаем локальные данные в ОЗУ
  //return $p.adapters.pouch.load_data();

  // // читаем локальные данные в ОЗУ
  // pouch.load_changes({docs});
  // pouch.call_data_loaded({
  //   total_rows: docs.length,
  //   docs_written: docs.length,
  //   page: 1,
  //   limit: 300,
  //   start: Date.now(),
  // });

}

export default $p;
