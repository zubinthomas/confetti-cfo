'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Category extends Model {
    static associate(models) {
      Category.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
      Category.hasMany(models.SalesRecord, { foreignKey: 'categoryId', as: 'salesRecords' });
    }
  }

  Category.init(
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
      // e.g. "Pottery", "Textile", "Jewellery", "Horn & Wood", "Metal & Dokra",
      // "Stationary", "Leather & Jute", "Personal Care", "Lamp"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Category',
      tableName: 'categories',
      timestamps: true,
      indexes: [{ unique: true, fields: ['businessId', 'name'] }],
    }
  );

  return Category;
};
