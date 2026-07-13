'use strict';
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Channel extends Model {
    static associate(models) {
      Channel.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
      Channel.hasMany(models.SalesRecord, { foreignKey: 'channelId', as: 'salesRecords' });
    }
  }

  Channel.init(
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
      // e.g. "HP Store", "JP Store", "Online Sales", "Corporate/Others", "Factory Outlet"
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Channel',
      tableName: 'channels',
      timestamps: true,
      indexes: [{ unique: true, fields: ['businessId', 'name'] }],
    }
  );

  return Channel;
};
