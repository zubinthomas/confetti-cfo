'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class LineItem extends Model {
    static associate(models) {
      LineItem.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
      LineItem.belongsTo(models.LineItem, { foreignKey: 'parentLineItemId', as: 'parent' });
      LineItem.hasMany(models.LineItem, { foreignKey: 'parentLineItemId', as: 'children' });
      LineItem.hasMany(models.FinancialRecord, { foreignKey: 'lineItemId', as: 'financialRecords' });
    }
  }

  LineItem.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // nullable: some line items (e.g. "Salary", "Site Cost") recur identically
      // across businesses; scope to a business only when the label is business-specific
      businessId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // e.g. "F&B Product Sales", "Raw Material", "HR Cost", "Site Cost Percentage"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // broad grouping used for subtotal roll-ups and reporting
      category: {
        type: DataTypes.ENUM(
          'revenue',
          'cogs',
          'hr_cost',
          'operating_cost',
          'subtotal',
          'other'
        ),
        allowNull: false,
        defaultValue: 'other',
      },
      // most rows are a currency amount; many have a companion "X Percentage" row
      // directly below them in the sheet (e.g. "% COGS", "HR Cost Percentage")
      valueType: {
        type: DataTypes.ENUM('amount', 'percentage'),
        allowNull: false,
        defaultValue: 'amount',
      },
      // links a percentage line item to the amount line item it's computed from
      relatedAmountLineItemId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'LineItem',
      tableName: 'line_items',
      timestamps: true,
    }
  );

  return LineItem;
};
