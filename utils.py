
def plural(value, count=2):
    '''
    Usage: 
            {{ var|plural }}
            {{ var|plural:count }}
            
            If [count] > 1 or [count] is not specified, the filter returns the plural form of [var].
            Plural form is generated by sequentially applying the following rules:
                * convert 'y' at the end into 'ie'               (contry -> contrie)
                * convert 'ss' at the end into 'e'               (witness -> witnesse)
                * add a 's' at the end is none already there     (nation -> nations)
    '''
    words = value.split(' ')
    if len(words) > 1:
        # We got a phrase. Pluralise each word separately.
        ret = ' '.join([plural(word, count) for word in words])
    else:
        ret = value
        if ret in ['of']: return ret
        if count > 1:
            if ret in ['a', 'an']: return ''
            if ret[-1:] == 'y': 
                ret = ret[:-1] + 'ie'
            if ret[-2:] == 'ss': 
                ret = ret + 'e'
            if not ret[-1:] == 's':
                ret = ret + 's'
    return ret

def update_query_string(url, updates, url_wins=False):
    '''
        Replace parameter values in the query string of the given URL.
        If url_wins is True, the query string values in [url] will always supersede the values from [updates].
        
        E.g.
        
        >> _update_query_string('http://www.mysite.com/about?category=staff&country=UK', 'who=bill&country=US')
        'http://www.mysite.com/about?category=staff&who=bill&country=US'

        >> _update_query_string('http://www.mysite.com/about?category=staff&country=UK', {'who': ['bill'], 'country': ['US']})
        'http://www.mysite.com/about?category=staff&who=bill&country=US'
        
    '''
    show = url == '?page=2&amp;terms=%C3%86thelstan&amp;repository=&amp;ordering=&amp;years=&amp;place=&amp;basic_search_type=hands&amp;date=&amp;scribes=&amp;result_type=' and updates == 'result_type=manuscripts'
    
    ret = url.strip()
    if ret and ret[0] == '#': return ret

    from urlparse import urlparse, urlunparse, parse_qs
    
    # Convert string format into a dictionary
    if isinstance(updates, basestring):
        updates_dict = parse_qs(updates, True)
    else:
        from copy import deepcopy
        updates_dict = deepcopy(updates)
    
    # Merge the two query strings (url and updates)
    # note that urlparse preserves the url encoding (%, &amp;)
    parts = [p for p in urlparse(url)]
    # note that parse_qs converts u'terms=%C3%86thelstan' into u'\xc3\x86thelstan'
    # See http://stackoverflow.com/questions/16614695/python-urlparse-parse-qs-unicode-url
    # for the reaon behind the call to encode('ASCII') 
    query_dict = parse_qs(parts[4].encode('ASCII'))
    if url_wins:
        updates_dict.update(query_dict)
        query_dict = updates_dict
    else:
        query_dict.update(updates_dict)
    
    # Now query_dict is our updated query string as a dictionary 
    # Parse and unparse it again to remove the empty values
    query_dict = parse_qs(urlencode(query_dict, True))
    
    # Convert back into a string    
    parts[4] = urlencode(query_dict, True)
    
    # Place the query string back into the URL
    ret = urlunparse(parts)
    
    return ret

def urlencode(dict, doseq=0):
    ''' This is a unicode-compatible wrapper around urllib.urlencode()
        See http://stackoverflow.com/questions/3121186/error-with-urlencode-in-python
    '''
    import urllib
    d = {}
    for k,v in dict.iteritems():
        d[k] = []
        for v2 in dict[k]:
            if isinstance(v2, unicode):
                v2 = v2.encode('utf=8')
            d[k].append(v2)
    ret = urllib.urlencode(d, doseq)
    return ret

def get_json_response(data):
    '''Returns a HttpResponse with the given data variable encoded as json'''
    import json
    from django.http import HttpResponse 
    return HttpResponse(json.dumps(data), mimetype="application/json")
