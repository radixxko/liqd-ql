'use strict'
const QLModel = require('./model');
const Parser = require('./parser.js');

module.exports = class QL
{
    static get Model()
    {
        return QLModel;
    }

    static parse( query )
    {
        return Parser.query( query );
    }
}