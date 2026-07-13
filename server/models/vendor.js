'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Vendor extends Model {
    static associate(models) {
      Vendor.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
      Vendor.hasMany(models.ConsignmentRecord, { foreignKey: 'vendorId', as: 'consignmentRecords' });
    }
  }

  Vendor.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      businessId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // e.g. "The Burlap People / Tree Huggers Lifestyle Pvt Ltd", "Gud Gum", "Bandit"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // stored as a decimal fraction (e.g. 0.25 = 25%); can change over time,
      // so also captured per-record on ConsignmentRecord for historical accuracy
      commissionRate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Vendor',
      tableName: 'vendors',
      timestamps: true,
      indexes: [{ unique: true, fields: ['businessId', 'name'] }],
    }
  );

  return Vendor;
};
