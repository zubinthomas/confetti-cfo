'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class SalesRecord extends Model {
    static associate(models) {
      SalesRecord.belongsTo(models.Period, { foreignKey: 'periodId', as: 'period' });
      SalesRecord.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
      SalesRecord.belongsTo(models.Channel, { foreignKey: 'channelId', as: 'channel' });
      // optional: ties a sales record to a specific store/outlet BusinessUnit
      // when the source sheet breaks sales down by physical location
      SalesRecord.belongsTo(models.BusinessUnit, { foreignKey: 'businessUnitId', as: 'businessUnit' });
    }
  }

  SalesRecord.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      periodId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      channelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      businessUnitId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'SalesRecord',
      tableName: 'sales_records',
      timestamps: true,
      indexes: [
        { fields: ['periodId', 'categoryId', 'channelId', 'businessUnitId'] },
      ],
    }
  );

  return SalesRecord;
};
