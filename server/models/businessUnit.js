'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class BusinessUnit extends Model {
    static associate(models) {
      BusinessUnit.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
      BusinessUnit.hasMany(models.FinancialRecord, { foreignKey: 'businessUnitId', as: 'financialRecords' });
      BusinessUnit.hasMany(models.SalesRecord, { foreignKey: 'businessUnitId', as: 'salesRecords' });
    }
  }

  BusinessUnit.init(
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
      // e.g. "F&B", "Store", "Trading Items", "Pottery", "Batik", "Stitching",
      // "HP Store", "JP Store", "Factory Outlet"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // distinguishes a P&L department/sheet from a physical retail store/outlet
      unitType: {
        type: DataTypes.ENUM('department', 'store', 'outlet'),
        allowNull: false,
        defaultValue: 'department',
      },
    },
    {
      sequelize,
      modelName: 'BusinessUnit',
      tableName: 'business_units',
      timestamps: true,
      indexes: [{ unique: true, fields: ['businessId', 'name'] }],
    }
  );

  return BusinessUnit;
};
