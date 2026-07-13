'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Period extends Model {
    static associate(models) {
      Period.hasMany(models.FinancialRecord, { foreignKey: 'periodId', as: 'financialRecords' });
      Period.hasMany(models.SalesRecord, { foreignKey: 'periodId', as: 'salesRecords' });
      Period.hasMany(models.ConsignmentRecord, { foreignKey: 'periodId', as: 'consignmentRecords' });
    }
  }

  Period.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      periodType: {
        type: DataTypes.ENUM('week', 'month', 'year', 'custom'),
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      // original sheet label, e.g. "April 2025", "01-09-2025 to 07-09-2025", "Durga Puja 2025"
      label: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // e.g. "2025-2026"
      fiscalYear: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // flags special/event periods like "Durga Puja 2025" that fall outside the regular weekly cadence
      isSpecialEvent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'Period',
      tableName: 'periods',
      timestamps: true,
      indexes: [{ unique: true, fields: ['startDate', 'endDate', 'periodType'] }],
    }
  );

  return Period;
};
