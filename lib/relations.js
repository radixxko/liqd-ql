module.exports = class Relations
{
    #paths = new Map(); #relations;

    constructor( relations )
    {
        this.#relations = relations;
    }

    path( from, to )
    {
        let path = this.#paths.get( from + ' => ' + to ), relation;

        if( !path )
        {
            if( relation = (( this.#relations[from] && this.#relations[from][to] ) || ( this.#relations[to] && this.#relations[to][from] )))
            {
                let reverse = !( this.#relations[from] && this.#relations[from][to]);

                if( relation.condition )
                {
                    let condition = reverse ? relation.condition.slice().reverse() : relation.condition;

                    if( condition.length === 1 )
                    {
                        condition = [ condition[0], '=', condition[1] ];
                    }

                    path = [{ table: to, condition }];
                }
                else if( relation.path )
                {
                    let node = from;

                    path = [ ...( reverse ? relation.path : relation.path.slice().reverse() ), to ].map( to => { let p = this.path( node, to ); node = to; return p });
                }
            }

            if( path ){ this.#paths.set( from + ' => ' + to, path )}
        }

        return path;
    }
}