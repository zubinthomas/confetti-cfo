'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FinancialRecord extends Model {
    static associate(models) {
      FinancialRecord.belongsTo(models.BusinessUnit, { foreignKey: 'businessUnitId', as: 'businessUnit' });
      FinancialRecord.belongsTo(models.Period, { foreignKey: 'periodId', as: 'period' });
      FinancialRecord.belongsTo(models.LineItem, { foreignKey: 'lineItemId', as: 'lineItem' });
    }
  }

  FinancialRecord.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      businessUnitId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      periodId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lineItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // stores either a currency amount or a percentage (0-1), per lineItem.valueType
      value: {
        type: DataTypes.DECIMAL(16, 4),
        allowNull: false,
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'FinancialRecord',
      tableName: 'financial_records',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['businessUnitId', 'periodId', 'lineItemId'] },
      ],
    }
  );

  return FinancialRecord;
};
