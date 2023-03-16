type Collection = Array<any>;

type Lambda = (...args: any) => any;

type Counters = { [key: string]: number };

class Query {
  private collection: Collection;

  private selected?: Lambda;

  private orderByFilter?: Lambda;
  private groupByFilters?: Lambda[];
  private whereFilters?: Lambda[][];
  private havingFilters?: Lambda[][];
  private limitFilters?: number;

  private counters: Counters;

  constructor() {
    this.collection = [];

    this.selected = undefined;

    this.whereFilters = undefined;
    this.groupByFilters = undefined;
    this.orderByFilter = undefined;
    this.havingFilters = undefined;
    this.limitFilters = undefined;

    this.counters = {
      selectCount: 0,
      fromCount: 0,
      executeCount: 0,
      orderByCount: 0,
      groupByCount: 0,
    };
  }

  /****************************************************************
   *                           UTILS                              *
   ****************************************************************/

  private isSet = (attr?: any): boolean => !!attr;

  private filterBy = (xs: Collection, λ: Lambda): Collection | undefined => {
    if (!xs.length) return;

    if (this.isSet(this.groupByFilters) && Array.isArray(xs[0])) {
      return xs
        .map(([i, j]) => {
          if (j.length) return [i, this.filterBy(j, λ)];
        })
        .filter((x) => x !== undefined && x[1].length);
    }

    return xs.filter((x: any) => λ(x));
  };

  private mapByField = (xs: Collection, λ: Lambda) => xs.map((x: any) => λ(x));

  private mapByGroup = (xs: Collection, λs: Lambda[]): Collection => {
    const fields = λs.map((group) => new Set(this.mapByField(xs, group)));

    return this.computeGroups(xs, λs, fields);
  };

  private computeGroups = (
    xs: Collection,
    λs: Lambda[],
    fields: Set<any>[]
  ): Collection => {
    if (!fields.length) {
      return xs;
    }

    const group = λs.pop() as Lambda;
    const fieldGroup = fields.pop() as Set<any>;

    const result = [...fieldGroup].map((field) => [
      field,
      this.filterBy(xs, (x) => group(x) === field),
    ]);

    return this.computeGroups(result, λs, fields);
  };

  private filterGroups = (xs: Collection, λ: Lambda) => xs.filter((x) => λ(x));

  private sortResults = (xs: Collection, λ: Lambda) => {
    if (Array.isArray(xs[0])) {
      xs.map(([k, v]) => {
        Array.isArray(v[0])
          ? v.map(([K, V]: [any, any]) => V.sort(λ))
          : v.sort(λ);
      });
    }

    xs.sort(λ);
  };

  /****************************************************************
   *                           Handlers                           *
   ****************************************************************/

  private handleException = (counter: string, message: string) => {
    this.counters[counter]++;

    if (this.counters[counter] > 1) {
      throw new Error(message);
    }
  };

  private handleLimit = (xs: Collection, limitFilters?: number) =>
    this.isSet(limitFilters) ? xs.slice(0, limitFilters) : xs;

  private handleSelect = (xs: Collection, selected: Lambda) => {
    return this.isSet(selected) ? this.mapByField(xs, selected) : xs;
  };

  private handleWhere = (xs: Collection, whereFilters?: Lambda[][]) =>
    this.isSet(whereFilters)
      ? (whereFilters as Lambda[][]).reduce((acc: Collection, λs: Lambda[]) => {
          const union = λs.map((λ) => this.filterBy(xs, λ)).flat();

          const intersection =
            Array.isArray(acc) && acc.length
              ? acc.filter((x) => union.includes(x))
              : union;

          return intersection;
        }, [])
      : xs;

  private handleGroupBy = (xs: Collection, groupByFilters?: Lambda[]) =>
    this.isSet(groupByFilters)
      ? this.mapByGroup(xs, groupByFilters as Lambda[])
      : xs;

  private handleHaving = (xs: Collection, havingFilters?: Lambda[][]) => {
    return this.isSet(havingFilters)
      ? (havingFilters as Lambda[][]).reduce(
          (acc: Collection, λs: Lambda[]) => {
            const union = λs.map((λ) => this.filterGroups(xs, λ)).flat();

            const intersection =
              Array.isArray(acc) && acc.length
                ? acc.filter((x) => union.includes(x))
                : union;

            return intersection;
          },
          []
        )
      : xs;
  };

  private handleOrderBy = (xs: Collection, orderByFilter?: Lambda) => {
    if (this.isSet(orderByFilter)) {
      this.sortResults(xs, orderByFilter as Lambda);
    }
  };

  /*****************************************************************
   *                        Query Statements                       *
   ****************************************************************/

  public select(fields?: Lambda) {
    this.handleException('selectCount', 'Duplicate SELECT');

    this.selected = fields;

    return this;
  }

  public from(xs: Collection, ys?: Collection) {
    this.handleException('fromCount', 'Duplicate FROM');

    if (!this.isSet(ys)) {
    }
    this.collection = !this.isSet(ys)
      ? xs
      : xs.map((n: any) => (ys as Collection).map((m: any) => [n, m])).flat();

    return this;
  }

  public limit(limitFilters: number) {
    if (!this.isSet(limitFilters)) {
      this.limitFilters = NaN;
    }

    this.limitFilters = limitFilters;

    return this;
  }

  public where(...whereFilters: Lambda[]) {
    if (!this.isSet(this.whereFilters)) {
      this.whereFilters = [];
    }

    (this.whereFilters as Lambda[][]).push(whereFilters);

    return this;
  }

  public groupBy(...groupByFilters: Lambda[]) {
    this.handleException('groupByCount', 'Duplicate GROUPBY');

    this.groupByFilters = [...groupByFilters];

    return this;
  }

  public having(...havingFilters: Lambda[]) {
    if (!this.isSet(this.havingFilters)) {
      this.havingFilters = [];
    }

    (this.havingFilters as Lambda[][]).push(havingFilters);

    return this;
  }

  public orderBy(orderByFilter: Lambda) {
    this.handleException('orderByCount', 'Duplicate ORDERBY');

    this.orderByFilter = orderByFilter;

    return this;
  }

  /****************************************************************
   *                          DRIVER CODE                         *
   ****************************************************************/

  public execute() {
    this.handleException('executeCount', 'Duplicate EXECUTE');

    const where = this.handleWhere(this.collection, this.whereFilters);

    const groupBy = this.handleGroupBy(where, this.groupByFilters);

    this.handleOrderBy(groupBy, this.orderByFilter);

    const having = this.handleHaving(groupBy, this.havingFilters);

    const result = this.handleSelect(having, this.selected as Lambda);

    const limit = this.handleLimit(result, this.limitFilters);

    return limit;
  }
}

/**
 * This method mimics the SQL syntax with TypeScript.
 * Useful for getting items from a list of objects, filtering, grouping, sorting, etc.
 *
 * @see https://github.com/TiagoLimaRocha/mimic-sql
 *
 * @returns a new Query instance
 */
export function query() {
  return new Query();
}
