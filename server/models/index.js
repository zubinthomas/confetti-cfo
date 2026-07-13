'use strict';
const { Sequelize } = require('sequelize');

/**
 * Usage:
 *   const db = require('./models')(new Sequelize(process.env.DATABASE_URL, { dialect: 'postgres' }));
 *   await db.sequelize.sync();
 *   const { Business, BusinessUnit, Period, LineItem, FinancialRecord,
 *           Category, Channel, SalesRecord, Vendor, ConsignmentRecord } = db;
 */
module.exports = (sequelize) => {
  const modelDefiners = [
    require('./business'),
    require('./businessUnit'),
    require('./period'),
    require('./lineItem'),
    require('./financialRecord'),
    require('./category'),
    require('./channel'),
    require('./salesRecord'),
    require('./vendor'),
    require('./consignmentRecord'),
  ];

  const db = {};

  for (const define of modelDefiners) {
    const model = define(sequelize);
    db[model.name] = model;
  }

  for (const modelName of Object.keys(db)) {
    if (typeof db[modelName].associate === 'function') {
      db[modelName].associate(db);
    }
  }

  db.sequelize = sequelize;
  db.Sequelize = Sequelize;

  return db;
};
