const QL = require('../lib/ql');
const SQL = new (require('liqd-sql'))(
{
    mysql :
    {
        host     : '127.0.0.1',
        user     : 'root',
        password : 'testtest1',
        database : 'db0'
    }
});

 let tables = {
    cities: {
        columns :
        {
            id         : { type: 'BIGINT:UNSIGNED', increment: true },
            name       : { type: 'VARCHAR:255' },
            postalCode : { type: 'VARCHAR:255' }
        },
        indexes : {
            primary : 'id',
            unique  : [],
            index   : [ 'name', 'postalCode' ]
        }
    },
    schools: {
        columns :
        {
            id      : { type: 'BIGINT:UNSIGNED', increment: true },
            name    : { type: 'VARCHAR:255' },
            cityID  : { type: 'BIGINT:UNSIGNED' }
        },
        indexes : {
            primary : 'id',
            unique  : [],
            index   : [ 'cityID' ]
        }
    },
    persons: {
        columns :
        {
            id       : { type: 'BIGINT:UNSIGNED', increment: true },
            name     : { type: 'VARCHAR:255' },
            surname  : { type: 'VARCHAR:255' },
            cityID   : { type: 'BIGINT:UNSIGNED' }
        },
        indexes : {
            primary : 'id',
            unique  : [],
            index   : [ 'cityID' ]
        }
    },
    persons_schools: {
        columns :
        {
            id       : { type: 'BIGINT:UNSIGNED', increment: true },
            personID : { type: 'BIGINT:UNSIGNED' },
            schoolID : { type: 'BIGINT:UNSIGNED' }
        },
        indexes : {
            primary : 'id',
            unique  : [  'personID, schoolID' ],
            index   : [ ]
        }
    }
};
let relations = {
    "cities":
    {
        "schools" : { "condition": [ "schools.cityID = cities.id" ] },
        "persons" : { "condition": [ "persons.cityID = cities.id" ] }
    },
    "persons_schools":
    {
        "persons" : { "condition": [ "persons.id = persons_schools.personID" ] },
        "schools" : { "condition": [ "schools.id = persons_schools.schoolID" ] }
    },
    "persons":
    {
        "schools" : { "condition": [ "schools.id = persons.schoolID" ] }
    }
}

let router = ()=>{
    return new QL( SQL, tables, relations, router );
};

let query = 'cities( id < 40 )[ id, name, schools()[ id, name, cities(){ persons()[ id, name ] } ] ] ]';

async function test()
{
    try {
        console.log( 'Result: \n', JSON.stringify( await new QL( SQL, tables, relations, router ).parse( query ), null, '    ' ) );
    } catch (e) {
        console.log( { e } );
    }

}

setTimeout( test, 1000 );
