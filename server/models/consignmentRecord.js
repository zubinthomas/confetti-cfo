'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ConsignmentRecord extends Model {
    static associate(models) {
      ConsignmentRecord.belongsTo(models.Period, { foreignKey: 'periodId', as: 'period' });
      ConsignmentRecord.belongsTo(models.Vendor, { foreignKey: 'vendorId', as: 'vendor' });
    }
  }

  ConsignmentRecord.init(
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
      vendorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
      },
      // commission rate in effect for this specific period/record
      commissionRate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'ConsignmentRecord',
      tableName: 'consignment_records',
      timestamps: true,
      indexes: [{ unique: true, fields: ['periodId', 'vendorId'] }],
    }
  );

  return ConsignmentRecord;
};
