'use strict';

const assert = require('assert');
const QL = require('../../lib/ql');


const SQL = new (require('liqd-sql'))(
    {
        mysql :
        {
            host     : 'host',
            user     : 'user',
            password : 'password',
            database : 'liqd_test'
        }
});



class Person extends QL.Model
{
    constructor( DB, router )
    {
        super({ DB, router, tables: [ 'persons' ], relations:
        {
            persons: 
            {
                persons_schools : { condition: [ 'persons_schools.personID = person.id' ]},
                cities : { condition: [  'persons.cityID = cities.id' ]},
                schools : { path: [ 'persons_schools' ]}
            }
        }});
    }
}


it( 'should create table cities', async() =>
{
    // drop table
    let deleted = await SQL.query( 'DROP TABLE cities;' ).execute(true);

    // create table
    let created = await SQL.query({
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
    }, 'cities' ).create_table( true );

    assert.ok( created.ok, 'Cannot create table cites\n' + JSON.stringify(created, null, '  ') );

    // insert data
    let inserted = await SQL.query( 'cities' ).insert([
        { id: 1, name: 'Poprad', postalCode: '05801'},
        { id: 2, name: 'Ruzomberok', postalCode: '03401'},
        { id: 3, name: 'Liptovsky Mikulas', postalCode: '02732'},
        { id: 4, name: 'Spisska Nova Ves', postalCode: '05201'},
    ]);

    assert.ok( inserted.ok, 'Cannot insert into table cites\n' + JSON.stringify(inserted, null, '  ') );
})
.timeout( 3000 );





it( 'should create table schools', async() =>
{
    // drop table
    let deleted = await SQL.query( 'DROP TABLE schools;' ).execute(true);


    // create table
    let created = await SQL.query({
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
    }, 'schools' ).create_table( true );

    assert.ok( created.ok, 'Cannot create table schools\n' + JSON.stringify(created, null, '  ') );


    // insert data
    let inserted = await SQL.query( 'schools' ).insert([
        { id: 1, name: 'Mladeze', cityID: '1'},
        { id: 2, name: 'Tajovskeho', cityID: '1'},
        { id: 3, name: 'Podhajska', cityID: '2'},
        { id: 4, name: 'Cintorinska', cityID: '2'},
        { id: 5, name: 'Hranicna', cityID: '3'},
        { id: 6, name: 'Hlavna', cityID: '3'},
        { id: 7, name: 'Kpt. Nalepku', cityID: '4'},
        { id: 8, name: 'Ludvika Svobodu', cityID: '4'},
    ]);

    assert.ok( inserted.ok, 'Cannot insert into table schools\n' + JSON.stringify(inserted, null, '  ') );
})
.timeout( 3000 );




it( 'should create table persons', async() =>
{
    // drop table
    let deleted = await SQL.query( 'DROP TABLE persons;' ).execute(true);


    // create table
    let created = await SQL.query({
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
    }, 'persons' ).create_table( true );

    assert.ok( created.ok, 'Cannot create table persons\n' + JSON.stringify(created, null, '  ') );


    // insert data
    let inserted = await SQL.query( 'persons' ).insert([
        { id: 1, name: 'John', surname: 'D.', cityID: '1'},
        { id: 2, name: 'John', surname: 'K.', cityID: '1'},
        { id: 3, name: 'John', surname: 'J.', cityID: '1'},
        { id: 4, name: 'John', surname: 'H.', cityID: '1'},
        { id: 5, name: 'John', surname: 'J.', cityID: '2'},
        { id: 6, name: 'John', surname: 'S.', cityID: '2'},
        { id: 7, name: 'John', surname: 'S.', cityID: '2'},
        { id: 8, name: 'John', surname: 'S.', cityID: '2'},
        { id: 9, name: 'John', surname: 'K.', cityID: '3'},
        { id: 10, name: 'John', surname: 'K.', cityID: '3'},
        { id: 11, name: 'John', surname: 'C.', cityID: '3'},
        { id: 12, name: 'John', surname: 'Ch.', cityID: '3'},
        { id: 13, name: 'John', surname: 'P.', cityID: '4'},
        { id: 14, name: 'John', surname: 'G.', cityID: '4'},
        { id: 15, name: 'John', surname: 'K.', cityID: '4'},
        { id: 16, name: 'John', surname: 'S.', cityID: '4'}
    ]);

    assert.ok( inserted.ok, 'Cannot insert into table persons\n' + JSON.stringify(inserted, null, '  ') );
})
.timeout( 3000 );





it( 'should create table persons_schools', async() =>
{
    // drop table
    let deleted = await SQL.query( 'DROP TABLE persons_schools;' ).execute(true);


    // create table
    let created = await SQL.query({
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
    }, 'persons_schools' ).create_table( true );

    assert.ok( created.ok, 'Cannot create table persons_schools\n' + JSON.stringify(created, null, '  ') );


    // insert data
    let inserted = await SQL.query( 'persons_schools' ).insert([
        { id: 1, personID: '1', schoolID: '1'},
        { id: 2, personID: '2', schoolID: '2'},
        { id: 3, personID: '3', schoolID: '3'},
        { id: 4, personID: '4', schoolID: '4'},
        { id: 5, personID: '5', schoolID: '5'},
        { id: 6, personID: '6', schoolID: '6'},
        { id: 7, personID: '7', schoolID: '7'},
        { id: 8, personID: '8', schoolID: '8'},
        { id: 9, personID: '9', schoolID: '1'},
        { id: 10, personID: '10', schoolID: '2'},
        { id: 11, personID: '11', schoolID: '3'},
        { id: 12, personID: '12', schoolID: '4'},
        { id: 13, personID: '13', schoolID: '5'},
        { id: 14, personID: '14', schoolID: '6'},
        { id: 15, personID: '15', schoolID: '7'},
        { id: 16, personID: '16', schoolID: '8'}
    ]);

    assert.ok( inserted.ok, 'Cannot insert into table persons_schools\n' + JSON.stringify(inserted, null, '  ') );
})
.timeout( 3000 );










// it( 'should fetch data for query', async() =>
// {
//     const person = new Person(SQL);
//     person.get(`persons(name = 'tomas'){surname, cities(){name}}`);
// })
// .timeout( 30000 );