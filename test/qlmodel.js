'use strict';

const QLModel = require('../lib/model');
const SQL = require('liqd-sql');
const DB = new SQL(
{
    mysql: 
    {
        host     : '192.168.1.30',
        user     : 'qltest',
        password : 'qltest',
        database : 'qltest'
    }
})

const model = new QLModel( DB, [ 'cities', 'schools', 'persons', 'persons_schools' ],
{
    "cities":
    {
        "schools" : { "condition": "schools.cityID = cities.id" },
        "persons" : { "condition": "persons.cityID = cities.id" }
    },
    "persons_schools":
    {
        "persons" : { "condition": "persons.id = persons_schools.personID" },
        "schools" : { "condition": "schools.id = persons_schools.schoolID" }
    },
    "persons":
    {
        "schools" : { "path": [ "persons_schools" ] }
    }
});

DB.query('cities').get();

setTimeout( async function()
{
    let start = process.hrtime();

    let result = await model.get(
    {
        table: 'cities',
        condition: [[ 'active', '=', 1 ], [ 'postalCode', 'LIKE', '05%' ]],
        columns: 
        {
            mesto: 'name',
            psc: 'postalCode',
            skolicky: 
            {
                table: 'schools',
                condition: [[ 'active', '=', 1 ]],
                columns: 
                {
                    skola: 'name',
                    cloviecici: 
                    {
                        table: 'persons',
                        columns: 
                        {
                            id: 'id',
                            meno: 'name',
                            priezvisko: 'surname'
                        }
                    }
                }
            }
        }
    });

    let end = process.hrtime( start );

    console.log( JSON.stringify( result, null, '  ' ), ( end[0] * 1000 + end[1] / 1e6 ).toFixed(2) + ' ms' );
},
2000 );