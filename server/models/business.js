'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Business extends Model {
    static associate(models) {
      Business.hasMany(models.BusinessUnit, { foreignKey: 'businessId', as: 'businessUnits' });
      Business.hasMany(models.LineItem, { foreignKey: 'businessId', as: 'lineItems' });
      Business.hasMany(models.Category, { foreignKey: 'businessId', as: 'categories' });
      Business.hasMany(models.Channel, { foreignKey: 'businessId', as: 'channels' });
      Business.hasMany(models.Vendor, { foreignKey: 'businessId', as: 'vendors' });
    }
  }

  Business.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // e.g. "Cafe", "CEPL", "Sienna"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Business',
      tableName: 'businesses',
      timestamps: true,
    }
  );

  return Business;
};
